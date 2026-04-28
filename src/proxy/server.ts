import http from 'http';
import https from 'https';
import crypto from 'crypto';
import { PassThrough } from 'stream';
import zlib from 'zlib';
import { applyOptimizations, setOptimizationConfig } from '../optimizations/index';
import * as statsService from '../services/stats';
import * as budgetService from '../services/budget';
import * as historyService from '../services/history';
import { calculateCost } from './pricing';
import { handleResponse, extractStreamUsage } from './responseHandler';
import requestTracker from './requestTracker';

interface ProxyConfig {
  port: number;
  openaiKey?: string;
  anthropicKey?: string;
}

type ApiType = 'openai' | 'anthropic' | 'unknown';

const OPENAI_BASE = 'https://api.openai.com';
const ANTHROPIC_BASE = 'https://api.anthropic.com';

const DEFAULT_PROXY_TIMEOUT = 60000;
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 请求体最大 10MB
const BODY_COLLECT_TIMEOUT = 30000; // 请求体收集超时 30s，防 slowloris
const MAX_CONNECTIONS = 100; // 最大并发连接数
const MIN_GZIP_SIZE = 1024; // 响应体低于此字节数不压缩，开销大于收益
const SHUTDOWN_TIMEOUT = 5000; // 优雅关闭等待超时 5s
const SSE_BUFFER_SOFT_LIMIT = 10240; // SSE 缓冲区软限制，保留最近 10KB
const SSE_BUFFER_HARD_LIMIT = 1024 * 1024; // SSE 缓冲区绝对上限 1MB

/** HTTPS 连接池配置 */
const HTTPS_MAX_SOCKETS = 50;
const HTTPS_KEEPALIVE_MSECS = 30000;
const HTTPS_TIMEOUT = 120000;
const BUDGET_SYNC_INTERVAL = 60000; // 预算快照定期同步间隔
const BUDGET_WARNING_THRESHOLD = 80; // 预算使用率警告阈值（%）

/** HTTPS 连接池：复用 TLS 连接，避免每次请求重新握手 */
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: HTTPS_MAX_SOCKETS,
  keepAliveMsecs: HTTPS_KEEPALIVE_MSECS,
  timeout: HTTPS_TIMEOUT
});

/**
 * 结构化日志辅助函数
 */
function logProxy(level: 'info' | 'warn' | 'error', msg: string, data?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  if (data) {
    console.log(`${prefix} ${msg}`, JSON.stringify(data));
  } else {
    console.log(`${prefix} ${msg}`);
  }
}

/**
 * 检测请求是否为流式（stream: true）
 * 优先使用已解析对象，避免重复 JSON.parse
 */
function isStreamRequest(body: string, parsed?: Record<string, unknown>): boolean {
  if (parsed && typeof parsed === 'object') {
    return parsed.stream === true;
  }
  try {
    const obj = JSON.parse(body);
    return obj.stream === true;
  } catch {
    return false;
  }
}

/** 请求结果数据，用于统一记录统计/预算/历史 */
interface RequestResult {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/** 预算状态内存快照，用于请求前快速检查 */
interface BudgetSnapshot {
  monthlyLimit: number;
  monthlySpent: number;
  dailyLimit: number;
  dailySpent: number;
}

/**
 * 统一记录请求结果：统计 → 预算 → 历史
 * 流式和非流式路径共用，每个服务独立 try-catch
 * 返回 { cost, allSucceeded } 供调用方决定是否更新内存快照
 */
async function recordRequestResult(
  result: RequestResult,
  apiType: string,
  requestId: string | undefined
): Promise<{ cost: number; allSucceeded: boolean }> {
  const cost = calculateCost(result.model, result.inputTokens, result.outputTokens);
  const cachedTokens = result.cacheReadTokens + result.cacheCreationTokens;
  let allSucceeded = true;

  try {
    await statsService.addStats({
      apiType,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cachedTokens,
      cost
    });
  } catch (err) {
    allSucceeded = false;
    logProxy('error', '统计记录失败', { requestId, error: (err instanceof Error ? err.message : String(err)) });
  }

  try {
    await budgetService.updateSpent('daily', cost);
    await budgetService.updateSpent('monthly', cost);
  } catch (err) {
    allSucceeded = false;
    logProxy('error', '预算更新失败', { requestId, error: (err instanceof Error ? err.message : String(err)) });
  }

  try {
    await historyService.addRequest({
      apiType,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cachedTokens,
      cost,
      cached: result.cacheReadTokens > 0,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    allSucceeded = false;
    logProxy('error', '历史记录失败', { requestId, error: (err instanceof Error ? err.message : String(err)) });
  }

  return { cost, allSucceeded };
}

/**
 * 向上游 API 发送请求，返回完整响应（非流式）
 */
/** 非流式上游响应体最大缓冲 10MB，超出时截断防止内存耗尽 */
const MAX_UPSTREAM_RESPONSE_SIZE = 10 * 1024 * 1024;

function sendUpstream(
  options: https.RequestOptions,
  body: string,
  timeout: number
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const opts = { ...options, agent: httpsAgent };
    let settled = false;
    const req = https.request(opts, (res) => {
      // 收到响应即取消超时计时器，避免已完成的请求被意外 destroy
      req.setTimeout(0);
      const chunks: Buffer[] = [];
      let totalSize = 0;
      res.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize <= MAX_UPSTREAM_RESPONSE_SIZE) {
          chunks.push(chunk);
        }
      });
      res.on('end', () => {
        if (settled) return;
        settled = true;
        resolve({
          statusCode: res.statusCode || 500,
          headers: res.headers,
          body: Buffer.concat(chunks).toString()
        });
      });
      // 上游断连时确保 promise 不会挂起
      res.on('error', (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });
    });

    req.setTimeout(timeout, () => {
      if (settled) return;
      settled = true;
      req.destroy(new Error('上游 API 响应超时'));
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

const CIRCUIT_BREAKER_THRESHOLD = 5;  // 连续失败 5 次触发熔断
const CIRCUIT_BREAKER_COOLDOWN = 60000; // 熔断冷却 60 秒

/** 不应转发给客户端的 hop-by-hop 头 */
const HOP_BY_HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'te',
  'upgrade', 'proxy-connection'
]);

/** 过滤响应头：移除 hop-by-hop 头 + CRLF 注入防护 */
function sanitizeResponseHeaders(headers: http.IncomingHttpHeaders): http.OutgoingHttpHeaders {
  const result: http.OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    // CRLF 注入防护：移除头值中的换行符
    if (typeof value === 'string') {
      result[key] = value.replace(/[\r\n]/g, ' ');
    } else if (Array.isArray(value)) {
      result[key] = value.map(v => typeof v === 'string' ? v.replace(/[\r\n]/g, ' ') : v);
    } else if (value !== undefined) {
      result[key] = String(value).replace(/[\r\n]/g, ' ');
    }
  }
  return result;
}

class ProxyServer {
  private server: http.Server | null = null;
  private port: number;
  private openaiKey?: string;
  private anthropicKey?: string;
  private requestCount = 0;
  private totalSavedTokens = 0;
  private activeConnections = new Set<http.ServerResponse>();
  private activeUpstreamRequests = new Set<http.ClientRequest>();
  private shuttingDown = false;
  private proxyTimeout: number;
  /** 按 API 提供商分离的熔断器，OpenAI 故障不阻断 Anthropic */
  private circuitBreakers = new Map<ApiType, { failures: number; openUntil: number }>();
  private budgetState: BudgetSnapshot = { monthlyLimit: 100, monthlySpent: 0, dailyLimit: 10, dailySpent: 0 };
  private budgetSyncTimer: ReturnType<typeof setInterval> | null = null;
  private errorCallback: (() => void) | null = null;

  constructor(config: ProxyConfig) {
    this.port = config.port;
    this.openaiKey = config.openaiKey;
    this.anthropicKey = config.anthropicKey;
    this.proxyTimeout = DEFAULT_PROXY_TIMEOUT;
  }

  detectApiType(path: string): ApiType {
    if (path.includes('/v1/chat/completions') ||
        path.includes('/v1/completions') ||
        path.includes('/v1/embeddings') ||
        path.includes('/v1/models')) {
      return 'openai';
    }
    if (path.includes('/v1/messages') ||
        path.includes('/v1/complete')) {
      return 'anthropic';
    }
    return 'unknown';
  }

  getTargetBase(apiType: ApiType): string {
    switch (apiType) {
      case 'openai': return OPENAI_BASE;
      case 'anthropic': return ANTHROPIC_BASE;
      default: return OPENAI_BASE;
    }
  }

  transformHeaders(headers: http.IncomingMessage['headers'], apiType: ApiType): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      // 不转发 host（已由目标 URL 决定）和 accept-encoding（代理自行处理压缩）
      if (lowerKey === 'host' || lowerKey === 'accept-encoding') continue;

      const stringValue = Array.isArray(value) ? value[0] : value;

      if (lowerKey === 'authorization') {
        if (apiType === 'anthropic' && this.anthropicKey) {
          result['x-api-key'] = this.anthropicKey;
        } else if (apiType === 'openai' && this.openaiKey) {
          result['authorization'] = `Bearer ${this.openaiKey}`;
        } else if (stringValue) {
          // 未配置自定义 Key 时透传原始认证头
          result['authorization'] = stringValue;
        }
      } else if (lowerKey === 'x-api-key') {
        if (apiType === 'anthropic' && this.anthropicKey) {
          result['x-api-key'] = this.anthropicKey;
        }
      } else if (stringValue) {
        result[key] = stringValue;
      }
    }

    if (apiType === 'anthropic') {
      result['anthropic-version'] = '2023-06-01';
    }

    return result;
  }

  private collectBody(req: http.IncomingMessage): Promise<string> {
    // Content-Length 预检：已知长度超限时立即拒绝，避免缓冲无用数据
    const declaredLength = parseInt(req.headers['content-length'] || '0', 10);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_SIZE) {
      return Promise.reject(new Error(`请求体超过最大限制 (${MAX_BODY_SIZE / 1024 / 1024}MB)`));
    }

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;
      let settled = false;
      const cleanup = () => {
        settled = true;
        clearTimeout(collectTimer);
        req.removeListener('data', onData);
        req.removeListener('end', onEnd);
        req.removeListener('error', onError);
      };
      // 请求体收集超时，防止 slowloris 攻击
      const collectTimer = setTimeout(() => {
        if (settled) return;
        cleanup();
        req.destroy();
        reject(new Error('请求体接收超时'));
      }, BODY_COLLECT_TIMEOUT);
      const onData = (chunk: Buffer) => {
        if (settled) return;
        totalSize += chunk.length;
        if (totalSize > MAX_BODY_SIZE) {
          cleanup();
          req.destroy();
          reject(new Error(`请求体超过最大限制 (${MAX_BODY_SIZE / 1024 / 1024}MB)`));
          return;
        }
        chunks.push(chunk);
      };
      const onEnd = () => { if (!settled) { cleanup(); resolve(Buffer.concat(chunks).toString()); } };
      const onError = (err: Error) => { if (!settled) { cleanup(); reject(err); } };
      req.on('data', onData);
      req.on('end', onEnd);
      req.on('error', onError);
    });
  }

  start(): Promise<void> {
    this.shuttingDown = false;
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (clientReq, clientRes) => {
        // 健康检查端点
        if (clientReq.method === 'GET' && (clientReq.url === '/health' || clientReq.url === '/')) {
          clientRes.writeHead(200, { 'Content-Type': 'application/json' });
          clientRes.end(JSON.stringify({
            status: 'healthy',
            uptime: process.uptime(),
            activeConnections: this.activeConnections.size,
            requestCount: this.requestCount,
            shuttingDown: this.shuttingDown
          }));
          return;
        }
        // 并发连接数限制
        if (this.activeConnections.size >= MAX_CONNECTIONS) {
          const rejectId = `reject_${Date.now()}`;
          clientRes.writeHead(429, { 'Content-Type': 'application/json' });
          clientRes.end(JSON.stringify({ error: 'Too Many Requests', message: `并发连接超过 ${MAX_CONNECTIONS} 限制`, requestId: rejectId }));
          return;
        }

        this.requestCount++;
        this.activeConnections.add(clientRes);
        clientRes.on('close', () => this.activeConnections.delete(clientRes));

        // 优雅关闭期间拒绝新请求
        if (this.shuttingDown) {
          const rejectId = `reject_${Date.now()}`;
          clientRes.writeHead(503, { 'Content-Type': 'application/json' });
          clientRes.end(JSON.stringify({ error: 'Service Unavailable', message: '代理服务器正在关闭', requestId: rejectId }));
          return;
        }

        const requestStart = Date.now();
        const path = clientReq.url || '';
        const apiType = this.detectApiType(path);
        const targetBase = this.getTargetBase(apiType);

        logProxy('info', `${clientReq.method} ${path}`, { apiType, method: clientReq.method });

        const headers = this.transformHeaders(clientReq.headers, apiType);
        let rawBody: string;
        // 每个请求都有唯一 ID，后续优化管线可能覆盖
        let requestId = `req_${crypto.randomUUID().slice(0, 8)}`;
        try {
          rawBody = await this.collectBody(clientReq);
        } catch (err: unknown) {
          requestId = `req_${Date.now()}`;
          if (!clientRes.headersSent) {
            clientRes.writeHead(413, { 'Content-Type': 'application/json' });
            clientRes.end(JSON.stringify({ error: err instanceof Error ? err.message : '请求体过大', requestId }));
          }
          return;
        }

        // Content-Type 校验：POST 请求必须为 JSON
        if (clientReq.method === 'POST' && rawBody) {
          const contentType = (clientReq.headers['content-type'] || '').toLowerCase();
          if (!contentType.includes('application/json') && !contentType.includes('text/plain')) {
            requestId = `req_${Date.now()}`;
            if (!clientRes.headersSent) {
              clientRes.writeHead(415, { 'Content-Type': 'application/json' });
              clientRes.end(JSON.stringify({ error: 'Unsupported Media Type', message: '仅支持 application/json', requestId }));
            }
            return;
          }
        }

        let optimizedBody = rawBody;
        let savedTokens = 0;
        let parsedBody: Record<string, unknown> | undefined;

        if (apiType !== 'unknown' && rawBody && clientReq.method === 'POST') {
          try {
            const parsed = JSON.parse(rawBody);
            parsedBody = parsed;
            const result = applyOptimizations(apiType, parsed);

            if (result.appliedStrategies.length > 0) {
              optimizedBody = JSON.stringify(result.modifiedBody);
              savedTokens = result.savedTokens;
              this.totalSavedTokens += savedTokens;

              const requestMeta = requestTracker.createRequestMetadata(
                apiType,
                parsed,
                result.modifiedBody,
                result.originalTokens,
                result.optimizedTokens,
                savedTokens,
                result.appliedStrategies
              );

              requestId = requestMeta.requestId;

              logProxy('info', `优化请求`, { requestId, strategies: result.appliedStrategies, savedTokens, totalSaved: this.totalSavedTokens });

              await statsService.recordOptimization({
                apiType,
                model: parsed.model || 'unknown',
                savedTokens: savedTokens,
              });
            }
          } catch (e) {
            // JSON 解析或优化失败，直接转发原始请求
            logProxy('warn', '优化管线处理失败，转发原始请求', { requestId, error: (e as Error).message });
          }
        }

        // 只读 GET 请求（如 /v1/models）跳过预算和熔断检查
        const isReadOnlyGet = clientReq.method === 'GET' && (
          path.includes('/v1/models') || path.includes('/v1/files')
        );

        // 熔断器检查：按提供商独立判断（只读请求跳过）
        if (!isReadOnlyGet && this.isCircuitOpen(apiType)) {
          if (!clientRes.headersSent) {
            clientRes.writeHead(503, { 'Content-Type': 'application/json' });
            clientRes.end(JSON.stringify({ error: 'Service Unavailable', message: '上游 API 暂时不可达，熔断冷却中', requestId }));
          }
          return;
        }

        // 预算超限检查：只读请求跳过
        const budgetCheck = isReadOnlyGet ? { allowed: true as const } : this.checkBudget();
        if (!budgetCheck.allowed) {
          logProxy('warn', '预算超限，请求被拦截', { requestId, reason: budgetCheck.reason });
          if (!clientRes.headersSent) {
            clientRes.writeHead(429, { 'Content-Type': 'application/json' });
            clientRes.end(JSON.stringify({
              error: 'Budget Exceeded',
              message: budgetCheck.reason || '预算已用尽',
              requestId
            }));
          }
          return;
        }

        const options: https.RequestOptions = {
          hostname: targetBase.replace('https://', ''),
          port: 443,
          path: path,
          method: clientReq.method,
          headers: headers
        };

        // 流式请求：pipe 转发 + 拦截 SSE 提取 usage 统计
        if (isStreamRequest(rawBody, parsedBody)) {
          let parsedModel = 'unknown';
          try { parsedModel = JSON.parse(rawBody).model || 'unknown'; } catch { logProxy('warn', '流式请求体 JSON 解析失败', { requestId }); }

          // PassThrough 在外层声明，以便 timeout/error/close 回调中可以销毁
          const passThrough = new PassThrough();
          let clientDisconnected = false;

          // 客户端中途断连时，销毁上游请求和 PassThrough 以释放资源
          clientRes.on('close', () => {
            if (!clientRes.writableFinished) {
              clientDisconnected = true;
              logProxy('info', '客户端断开连接，清理流式资源', { requestId });
              passThrough.destroy();
              proxyReq.destroy();
            }
          });

          const proxyReq = https.request({ ...options, agent: httpsAgent }, (proxyRes) => {
            const statusCode = proxyRes.statusCode || 500;
            if (statusCode >= 400) {
              logProxy('error', `流式请求失败`, { requestId, statusCode });
              this.recordUpstreamFailure(apiType);
            } else {
              this.recordUpstreamSuccess(apiType);
            }
            const streamHeaders = sanitizeResponseHeaders(proxyRes.headers);
            if (budgetCheck.warning) {
              streamHeaders['X-Budget-Warning'] = budgetCheck.warning;
            }
            clientRes.writeHead(statusCode, streamHeaders);

            let sseBuffer = '';
            passThrough.on('data', (chunk: Buffer) => {
              if (clientDisconnected) return;
              sseBuffer += chunk.toString();
              // 超过绝对上限则强制断开，防止内存暴涨
              if (sseBuffer.length > SSE_BUFFER_HARD_LIMIT) {
                logProxy('error', 'SSE 缓冲超出上限，强制断开', { requestId });
                passThrough.destroy(new Error('SSE buffer exceeded hard limit'));
                return;
              }
              // 保留最近数据用于提取 usage，但确保不截断最后一个完整的 data: 行
              if (sseBuffer.length > SSE_BUFFER_SOFT_LIMIT) {
                const lastDataIdx = sseBuffer.lastIndexOf('\ndata: ');
                if (lastDataIdx > 0) {
                  sseBuffer = sseBuffer.slice(lastDataIdx + 1);
                } else {
                  sseBuffer = sseBuffer.slice(-SSE_BUFFER_SOFT_LIMIT);
                }
              }
            });
            passThrough.on('end', async () => {
              // 流结束后从 SSE 数据中提取 usage
              if (statusCode < 400) {
                try {
                  const usage = extractStreamUsage(sseBuffer);
                  if (usage) {
                    const model = usage.model || parsedModel;
                    const cost = calculateCost(model, usage.inputTokens, usage.outputTokens);
                    logProxy('info', `流式请求完成`, { requestId, model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cost: cost.toFixed(4), duration: `${Date.now() - requestStart}ms` });

                    const { cost: recordedCost, allSucceeded } = await recordRequestResult({
                      model,
                      inputTokens: usage.inputTokens,
                      outputTokens: usage.outputTokens,
                      cacheReadTokens: usage.cacheReadTokens,
                      cacheCreationTokens: usage.cacheCreationTokens
                    }, apiType, requestId);
                    if (allSucceeded) {
                      this.updateBudgetSnapshot(recordedCost);
                    } else {
                      this.loadBudgetSnapshot().catch((err) => {
                        logProxy('warn', '流式请求预算快照重载失败', { requestId, error: (err instanceof Error ? err.message : String(err)) });
                      });
                    }
                  }
                } catch (err) {
                  logProxy('warn', '流式 usage 提取失败', { requestId, error: (err instanceof Error ? err.message : String(err)) });
                }
              }
            });

            // 流传输中途出错时确保资源清理
            passThrough.on('error', (err) => {
              logProxy('error', 'PassThrough 流处理错误', { requestId, error: err.message });
              passThrough.destroy();
            });

            // 上游响应流出错时清理所有关联资源
            proxyRes.on('error', (err) => {
              logProxy('error', '上游响应流错误', { requestId, error: err.message });
              passThrough.destroy();
              proxyReq.destroy();
              this.activeUpstreamRequests.delete(proxyReq);
            });

            proxyRes.pipe(passThrough).pipe(clientRes);
          });

          // 先注册所有事件处理器，防止竞态条件下事件丢失
          this.activeUpstreamRequests.add(proxyReq);
          proxyReq.on('close', () => this.activeUpstreamRequests.delete(proxyReq));

          proxyReq.setTimeout(this.proxyTimeout, () => {
            this.activeUpstreamRequests.delete(proxyReq);
            proxyReq.destroy();
            passThrough.destroy();
            if (clientDisconnected || clientRes.destroyed) return;
            if (!clientRes.headersSent) {
              clientRes.writeHead(504, { 'Content-Type': 'application/json' });
              clientRes.end(JSON.stringify({ error: 'Gateway Timeout', message: '上游 API 响应超时', requestId }));
            } else if (!clientRes.writableEnded) {
              clientRes.write('\ndata: {"error":"timeout","message":"上游 API 响应超时，流被截断"}\n\n');
              clientRes.end();
            }
          });

          proxyReq.on('error', (_err) => {
            this.activeUpstreamRequests.delete(proxyReq);
            passThrough.destroy();
            if (clientDisconnected || clientRes.destroyed) return;
            if (!clientRes.headersSent) {
              clientRes.writeHead(502, { 'Content-Type': 'application/json' });
              clientRes.end(JSON.stringify({ error: '上游 API 请求失败', requestId }));
            } else if (!clientRes.writableEnded) {
              clientRes.write(`\ndata: {"error":"upstream_error","message":"上游 API 请求失败"}\n\n`);
              clientRes.end();
            }
          });

          if (optimizedBody) {
            proxyReq.write(optimizedBody);
          }
          proxyReq.end();
          return;
        }

        // 非流式请求：缓冲响应 + 智能重试 + 统计
        let lastError: Error | undefined;
        let upstreamResult: { statusCode: number; headers: http.IncomingHttpHeaders; body: string } | undefined;
        const maxAttempts = requestId ? requestTracker.MAX_RETRIES + 1 : 1;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          // 客户端已断连、响应已结束或代理正在关闭时放弃重试
          if (clientRes.destroyed || clientRes.writableEnded || this.shuttingDown) {
            logProxy('info', '连接不可用或代理正在关闭，终止重试', { requestId, attempt, shuttingDown: this.shuttingDown });
            break;
          }
          try {
            upstreamResult = await sendUpstream(options, optimizedBody, this.proxyTimeout);
            lastError = undefined;

            // 4xx 客户端错误不重试（408/429 除外）
            if (upstreamResult.statusCode >= 400 && !requestTracker.isRetryableStatus(upstreamResult.statusCode)) {
              break;
            }

            // 2xx/3xx 成功直接退出
            if (upstreamResult.statusCode < 400) {
              break;
            }

            // 可重试的 5xx/408/429，指数退避
            if (requestId && attempt < maxAttempts - 1) {
              const retryCount = requestTracker.incrementRetry(requestId);
              const delay = requestTracker.getRetryDelay(attempt);
              logProxy('warn', `服务端错误，指数退避重试`, { requestId, statusCode: upstreamResult.statusCode, retryCount, delay: `${Math.round(delay)}ms` });
              requestTracker.updateRequestStatus(requestId, 'retrying');
              await new Promise(r => setTimeout(r, delay));
            }
          } catch (err: unknown) {
            lastError = err instanceof Error ? err : new Error(String(err));
            // 网络错误可重试
            if (requestId && attempt < maxAttempts - 1) {
              const retryCount = requestTracker.incrementRetry(requestId);
              const delay = requestTracker.getRetryDelay(attempt);
              logProxy('warn', `网络错误，指数退避重试`, { requestId, error: lastError.message, retryCount, delay: `${Math.round(delay)}ms` });
              requestTracker.updateRequestStatus(requestId, 'retrying');
              await new Promise(r => setTimeout(r, delay));
            }
          }
        }

        if (lastError) {
          const errMsg = lastError instanceof Error ? lastError.message : String(lastError);
          logProxy('error', `代理请求失败`, { requestId, error: errMsg, duration: `${Date.now() - requestStart}ms` });
          if (requestId) {
            requestTracker.failRequest(requestId, errMsg, 502);
          }
          if (!clientRes.headersSent) {
            clientRes.writeHead(502, { 'Content-Type': 'application/json' });
            clientRes.end(JSON.stringify({ error: '上游 API 请求失败', requestId }));
          }
          return;
        }

        if (!upstreamResult) return;

        const statusCode = upstreamResult.statusCode;

        if (statusCode >= 400) {
          logProxy('error', `请求失败`, { requestId, statusCode, duration: `${Date.now() - requestStart}ms` });
          if (requestId) {
            requestTracker.failRequest(requestId, upstreamResult.body, statusCode);
          }
          this.recordUpstreamFailure(apiType);
        } else {
          this.recordUpstreamSuccess(apiType);
          const handleResult = handleResponse(upstreamResult.body, upstreamResult.headers as Record<string, string>, apiType);

          if (handleResult.stats && requestId) {
            requestTracker.completeRequest(requestId, {
              requestId,
              inputTokens: handleResult.stats.inputTokens,
              outputTokens: handleResult.stats.outputTokens,
              cacheReadTokens: handleResult.stats.cacheReadTokens,
              cacheCreationTokens: handleResult.stats.cacheCreationTokens,
              cost: calculateCost(handleResult.stats.model, handleResult.stats.inputTokens, handleResult.stats.outputTokens),
              model: handleResult.stats.model,
              duration: 0,
              completedAt: Date.now(),
              status: statusCode
            });

            const { cost: recordedCost, allSucceeded } = await recordRequestResult({
              model: handleResult.stats.model,
              inputTokens: handleResult.stats.inputTokens,
              outputTokens: handleResult.stats.outputTokens,
              cacheReadTokens: handleResult.stats.cacheReadTokens,
              cacheCreationTokens: handleResult.stats.cacheCreationTokens
            }, apiType, requestId);
            if (allSucceeded) {
              this.updateBudgetSnapshot(recordedCost);
            } else {
              this.loadBudgetSnapshot().catch((err) => {
                logProxy('warn', '非流式请求预算快照重载失败', { requestId, error: (err instanceof Error ? err.message : String(err)) });
              });
            }
          }
        }

        if (!clientRes.headersSent) {
          const respHeaders = sanitizeResponseHeaders(upstreamResult.headers);
          if (budgetCheck.warning) {
            respHeaders['X-Budget-Warning'] = budgetCheck.warning;
          }

          // 对 JSON 响应进行 gzip 压缩（非流式路径）
          const acceptEncoding = (clientReq.headers['accept-encoding'] || '').toLowerCase();
          const isJson = (upstreamResult.headers['content-type'] || '').includes('application/json');
          const bodyBuffer = Buffer.from(upstreamResult.body);

          if (isJson && bodyBuffer.length > MIN_GZIP_SIZE && acceptEncoding.includes('gzip')) {
            zlib.gzip(bodyBuffer, (gzipErr, compressed) => {
              // 异步回调时客户端可能已断开或响应已发送，防止重复写入
              if (clientRes.destroyed || clientRes.headersSent) return;
              if (gzipErr) {
                // 压缩失败时回退到未压缩响应
                logProxy('warn', 'Gzip 压缩失败，回退到未压缩响应', { requestId, error: gzipErr.message });
                clientRes.writeHead(statusCode, respHeaders);
                clientRes.end(upstreamResult.body);
              } else {
                respHeaders['content-encoding'] = 'gzip';
                delete respHeaders['content-length'];
                clientRes.writeHead(statusCode, respHeaders);
                clientRes.end(compressed);
              }
            });
          } else {
            clientRes.writeHead(statusCode, respHeaders);
            clientRes.end(upstreamResult.body);
          }
        }
      });

      this.server.on('error', (err: Error & { code?: string }) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`端口 ${this.port} 已被占用，请在设置中更换端口或关闭占用该端口的程序`));
        } else {
          reject(err);
        }
      });
      this.server.listen(this.port, async () => {
        console.log(`TokenBao proxy running on port ${this.port}`);
        console.log(`OpenAI: http://localhost:${this.port}/v1/chat/completions`);
        console.log(`Anthropic: http://localhost:${this.port}/v1/messages`);
        try {
          await this.loadBudgetSnapshot();
        } catch (err) {
          logProxy('warn', '初始预算快照加载失败，使用默认值', { error: (err as Error).message });
        }
        // 定期从 budgetService 重新同步预算快照，纠正浮点漂移
        this.budgetSyncTimer = setInterval(() => {
          this.loadBudgetSnapshot().catch((err) => {
            logProxy('warn', '定期预算快照同步失败', { error: (err instanceof Error ? err.message : String(err)) });
          });
        }, BUDGET_SYNC_INTERVAL);
        if (this.budgetSyncTimer && typeof this.budgetSyncTimer === 'object' && 'unref' in this.budgetSyncTimer) {
          this.budgetSyncTimer.unref();
        }
        resolve();
      });

      // 运行时 server 错误/关闭事件：立即触发回调通知主进程重启
      this.server.on('error', (err) => {
        logProxy('error', '代理服务器运行时错误', { error: (err as Error).message });
        // 服务器错误时清理预算同步定时器，防止资源泄漏
        if (this.budgetSyncTimer) {
          clearInterval(this.budgetSyncTimer);
          this.budgetSyncTimer = null;
        }
        if (this.errorCallback) this.errorCallback();
      });
      this.server.on('close', () => {
        if (!this.shuttingDown && this.errorCallback) {
          logProxy('warn', '代理服务器意外关闭');
          this.errorCallback();
        }
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.shuttingDown = true;
        if (this.budgetSyncTimer) {
          clearInterval(this.budgetSyncTimer);
          this.budgetSyncTimer = null;
        }

        // 停止接收新连接
        this.server.close(() => {
          clearTimeout(shutdownTimer);
          this.server = null;
          // 销毁连接池中的空闲 socket，防止资源泄漏
          httpsAgent.destroy();
          logProxy('info', '代理服务器已关闭');
          resolve();
        });

        // 优雅关闭：给活跃连接超时兜底
        const shutdownTimer = setTimeout(() => {
          // 销毁所有活跃的上游请求
          for (const req of this.activeUpstreamRequests) {
            req.destroy();
          }
          this.activeUpstreamRequests.clear();
          for (const res of this.activeConnections) {
            if (!res.writableEnded) {
              res.destroy();
            }
          }
          this.activeConnections.clear();
        }, SHUTDOWN_TIMEOUT);

        // 等待所有活跃连接结束
        const checkIdle = () => {
          if (this.activeConnections.size === 0 && this.activeUpstreamRequests.size === 0) {
            clearTimeout(shutdownTimer);
          }
        };
        for (const res of this.activeConnections) {
          if (res.writableEnded) {
            this.activeConnections.delete(res);
          } else {
            res.on('close', () => {
              this.activeConnections.delete(res);
              checkIdle();
            });
          }
        }
        checkIdle();
      } else {
        resolve();
      }
    });
  }

  setKeys(openaiKey?: string, anthropicKey?: string): void {
    this.openaiKey = openaiKey;
    this.anthropicKey = anthropicKey;
  }

  getStats(): { requests: number; savedTokens: number } {
    return { requests: this.requestCount, savedTokens: this.totalSavedTokens };
  }

  /** 获取指定提供商的熔断器状态 */
  private getCircuitBreaker(apiType: ApiType): { failures: number; openUntil: number } {
    let cb = this.circuitBreakers.get(apiType);
    if (!cb) {
      cb = { failures: 0, openUntil: 0 };
      this.circuitBreakers.set(apiType, cb);
    }
    return cb;
  }

  /** 检查指定提供商的熔断器是否开启 */
  private isCircuitOpen(apiType: ApiType): boolean {
    // 未知 API 类型不触发熔断（没有确定的上游目标）
    if (apiType === 'unknown') return false;
    const cb = this.getCircuitBreaker(apiType);
    if (cb.openUntil === 0) return false;
    if (Date.now() >= cb.openUntil) {
      // 冷却期结束，重置失败计数，给上游一个全新的失败周期
      cb.failures = 0;
      cb.openUntil = 0;
      return false;
    }
    return true;
  }

  /** 记录上游成功，重置该提供商的熔断器 */
  private recordUpstreamSuccess(apiType: ApiType): void {
    const cb = this.getCircuitBreaker(apiType);
    cb.failures = 0;
    cb.openUntil = 0;
  }

  /** 记录上游失败，达到阈值则触发该提供商的熔断 */
  private recordUpstreamFailure(apiType: ApiType): void {
    const cb = this.getCircuitBreaker(apiType);
    cb.failures++;
    if (cb.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      cb.openUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN;
      logProxy('warn', `熔断器触发 [${apiType}]，连续失败 ${cb.failures} 次，冷却 ${CIRCUIT_BREAKER_COOLDOWN / 1000}s`);
    }
  }

  /** 更新内存中的预算快照（请求记录后调用） */
  private updateBudgetSnapshot(cost: number): void {
    // 防止 NaN/Infinity 污染内存快照
    if (!Number.isFinite(cost) || cost < 0) return;
    // 防止极端累加溢出 MAX_SAFE_INTEGER
    const newMonthly = this.budgetState.monthlySpent + cost;
    const newDaily = this.budgetState.dailySpent + cost;
    this.budgetState.monthlySpent = Math.min(newMonthly, Number.MAX_SAFE_INTEGER);
    this.budgetState.dailySpent = Math.min(newDaily, Number.MAX_SAFE_INTEGER);
  }

  /** 检查月预算是否超限，返回 true 表示允许请求 */
  private checkBudget(): { allowed: boolean; warning?: string; reason?: string } {
    let { monthlyLimit, monthlySpent, dailyLimit, dailySpent } = this.budgetState;

    // 防止浮点累加导致 NaN/Infinity 异常
    if (!Number.isFinite(monthlySpent)) monthlySpent = 0;
    if (!Number.isFinite(dailySpent)) dailySpent = 0;

    // 日预算检查
    if (dailyLimit > 0 && dailySpent >= dailyLimit) {
      return { allowed: false, reason: `日预算已用尽 ($${dailySpent.toFixed(2)} / $${dailyLimit.toFixed(2)})` };
    }

    // 月预算检查
    if (monthlyLimit > 0 && monthlySpent >= monthlyLimit) {
      return { allowed: false, reason: `月预算已用尽 ($${monthlySpent.toFixed(2)} / $${monthlyLimit.toFixed(2)})` };
    }

    const monthlyPercent = monthlyLimit > 0 ? (monthlySpent / monthlyLimit) * 100 : 0;
    if (monthlyPercent >= BUDGET_WARNING_THRESHOLD) {
      return { allowed: true, warning: `Budget usage at ${Math.round(monthlyPercent)}%` };
    }

    return { allowed: true };
  }

  /** 从 budgetService 加载预算快照到内存 */
  async loadBudgetSnapshot(): Promise<void> {
    try {
      const status = await budgetService.getBudgetStatus();
      const { limit: mLimit, spent: mSpent } = status.monthly;
      const { limit: dLimit, spent: dSpent } = status.daily;
      // 防止持久化数据被污染时将 NaN/Infinity 写入内存快照
      this.budgetState.monthlyLimit = Number.isFinite(mLimit) ? mLimit : this.budgetState.monthlyLimit;
      this.budgetState.monthlySpent = Number.isFinite(mSpent) ? mSpent : this.budgetState.monthlySpent;
      this.budgetState.dailyLimit = Number.isFinite(dLimit) ? dLimit : this.budgetState.dailyLimit;
      this.budgetState.dailySpent = Number.isFinite(dSpent) ? dSpent : this.budgetState.dailySpent;
    } catch (err) {
      logProxy('warn', '预算快照加载失败，使用当前内存值', { error: (err instanceof Error ? err.message : String(err)) });
    }
  }

  isRunning(): boolean {
    if (!this.server) return false;
    // 检查 server 是否正在监听（而非仅对象存在）
    return this.server.listening;
  }

  getActiveConnections(): number {
    return this.activeConnections.size;
  }

  getPort(): number {
    const addr = this.server?.address();
    return typeof addr === 'object' && addr ? addr.port : this.port;
  }

  updateOptimizationConfig(config: { caching?: boolean; compression?: boolean; routing?: boolean; batching?: boolean; rules?: boolean; dlp?: boolean }): void {
    setOptimizationConfig(config);
  }

  /** 设置代理请求超时（毫秒），限制 1s-5min 防止异常值 */
  setProxyTimeout(timeout: number): void {
    if (timeout >= 1000 && timeout <= 300000) {
      this.proxyTimeout = timeout;
    }
  }

  /** 注册运行时错误回调，用于事件驱动的崩溃检测 */
  onServerError(callback: () => void): void {
    this.errorCallback = callback;
  }

  getProxyTimeout(): number {
    return this.proxyTimeout;
  }
}

export default ProxyServer;
