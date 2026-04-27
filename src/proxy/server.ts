import http from 'http';
import https from 'https';
import { PassThrough } from 'stream';
import { applyOptimizations, setOptimizationConfig } from '../optimizations/index';
import * as statsService from '../services/stats';
import * as budgetService from '../services/budget';
import * as historyService from '../services/history';
import { calculateCost } from './pricing';
import { handleResponse, recordStats } from './responseHandler';
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
const MAX_CONNECTIONS = 100; // 最大并发连接数
const SHUTDOWN_TIMEOUT = 5000; // 优雅关闭等待超时 5s

/** HTTPS 连接池：复用 TLS 连接，避免每次请求重新握手 */
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  keepAliveMsecs: 30000,
  timeout: 120000
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
 */
function isStreamRequest(body: string): boolean {
  try {
    const parsed = JSON.parse(body);
    return parsed.stream === true;
  } catch {
    return false;
  }
}

interface StreamUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  model: string;
}

/**
 * 从 SSE 流数据中提取 usage 统计
 * OpenAI: 最后一个包含 usage 的 data 事件
 * Anthropic: message_delta 事件中的 usage
 */
function extractStreamUsage(sseData: string, _apiType: string): StreamUsage | null {
  const lines = sseData.split('\n');

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6);
    if (data === '[DONE]') continue;

    try {
      const parsed = JSON.parse(data);

      // OpenAI 格式
      if (parsed.usage) {
        return {
          inputTokens: parsed.usage.prompt_tokens || 0,
          outputTokens: parsed.usage.completion_tokens || 0,
          cacheReadTokens: parsed.usage.prompt_tokens_details?.cached_tokens || 0,
          cacheCreationTokens: 0,
          model: parsed.model || 'unknown'
        };
      }

      // Anthropic 格式
      if (parsed.type === 'message_delta' && parsed.usage) {
        return {
          inputTokens: parsed.usage.input_tokens || 0,
          outputTokens: parsed.usage.output_tokens || 0,
          cacheReadTokens: parsed.usage.cache_read_input_tokens || 0,
          cacheCreationTokens: parsed.usage.cache_creation_input_tokens || 0,
          model: parsed.model || 'unknown'
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * 向上游 API 发送请求，返回完整响应（非流式）
 */
function sendUpstream(
  options: https.RequestOptions,
  body: string,
  timeout: number
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const opts = { ...options, agent: httpsAgent };
    let settled = false;
    const req = https.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
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

  constructor(config: ProxyConfig) {
    this.port = config.port;
    this.openaiKey = config.openaiKey;
    this.anthropicKey = config.anthropicKey;
    this.proxyTimeout = DEFAULT_PROXY_TIMEOUT;
  }

  detectApiType(path: string): ApiType {
    if (path.includes('/v1/chat/completions') ||
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
      if (key.toLowerCase() === 'host') continue;

      const stringValue = Array.isArray(value) ? value[0] : value;

      if (key.toLowerCase() === 'authorization') {
        if (apiType === 'anthropic' && this.anthropicKey) {
          result['x-api-key'] = this.anthropicKey;
        } else if (apiType === 'openai' && this.openaiKey) {
          result['authorization'] = `Bearer ${this.openaiKey}`;
        }
      } else if (key.toLowerCase() === 'x-api-key') {
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
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;
      let exceeded = false;
      const onData = (chunk: Buffer) => {
        if (exceeded) return;
        totalSize += chunk.length;
        if (totalSize > MAX_BODY_SIZE) {
          exceeded = true;
          req.removeListener('data', onData);
          req.destroy();
          reject(new Error(`请求体超过最大限制 (${MAX_BODY_SIZE / 1024 / 1024}MB)`));
          return;
        }
        chunks.push(chunk);
      };
      req.on('data', onData);
      req.on('end', () => { if (!exceeded) resolve(Buffer.concat(chunks).toString()); });
      req.on('error', (err) => { if (!exceeded) reject(err); });
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
        let requestId: string | undefined;
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

        if (apiType !== 'unknown' && rawBody && clientReq.method === 'POST') {
          try {
            const parsed = JSON.parse(rawBody);
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

        const options: https.RequestOptions = {
          hostname: targetBase.replace('https://', ''),
          port: 443,
          path: path,
          method: clientReq.method,
          headers: headers
        };

        // 流式请求：pipe 转发 + 拦截 SSE 提取 usage 统计
        if (isStreamRequest(rawBody)) {
          let parsedModel = 'unknown';
          try { parsedModel = JSON.parse(rawBody).model || 'unknown'; } catch { logProxy('warn', '流式请求体 JSON 解析失败', { requestId }); }

          // PassThrough 在外层声明，以便 timeout/error 回调中可以销毁
          const passThrough = new PassThrough();

          const proxyReq = https.request({ ...options, agent: httpsAgent }, (proxyRes) => {
            const statusCode = proxyRes.statusCode || 500;
            if (statusCode >= 400) {
              logProxy('error', `流式请求失败`, { requestId, statusCode });
            }
            clientRes.writeHead(statusCode, proxyRes.headers);

            let sseBuffer = '';
            const SSE_BUFFER_HARD_LIMIT = 1024 * 1024; // 1MB 绝对上限
            passThrough.on('data', (chunk: Buffer) => {
              sseBuffer += chunk.toString();
              // 超过绝对上限则强制断开，防止内存暴涨
              if (sseBuffer.length > SSE_BUFFER_HARD_LIMIT) {
                logProxy('error', 'SSE 缓冲超出上限，强制断开', { requestId });
                passThrough.destroy(new Error('SSE buffer exceeded hard limit'));
                return;
              }
              // 只保留最后 10KB 用于提取 usage，避免内存增长
              if (sseBuffer.length > 10240) {
                sseBuffer = sseBuffer.slice(-10240);
              }
            });
            passThrough.on('end', async () => {
              // 流结束后从 SSE 数据中提取 usage
              if (statusCode < 400) {
                try {
                  const usage = extractStreamUsage(sseBuffer, apiType);
                  if (usage) {
                    const cost = calculateCost(usage.model || parsedModel, usage.inputTokens, usage.outputTokens);
                    logProxy('info', `流式请求完成`, { requestId, model: usage.model || parsedModel, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cost: cost.toFixed(4), duration: `${Date.now() - requestStart}ms` });

                    // 顺序记录保证数据一致性
                    try {
                      await statsService.addStats({
                        apiType,
                        model: usage.model || parsedModel,
                        inputTokens: usage.inputTokens,
                        outputTokens: usage.outputTokens,
                        cachedTokens: usage.cacheReadTokens + usage.cacheCreationTokens,
                        cost
                      });
                      await budgetService.updateSpent('daily', cost);
                      await budgetService.updateSpent('monthly', cost);
                      await historyService.addRequest({
                        apiType,
                        model: usage.model || parsedModel,
                        inputTokens: usage.inputTokens,
                        outputTokens: usage.outputTokens,
                        cachedTokens: usage.cacheReadTokens + usage.cacheCreationTokens,
                        cost,
                        cached: usage.cacheReadTokens > 0,
                        timestamp: new Date().toISOString()
                      });
                    } catch (err) {
                      logProxy('error', '流式统计记录失败', { requestId, error: (err instanceof Error ? err.message : String(err)) });
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

            proxyRes.pipe(passThrough).pipe(clientRes);
          });

          proxyReq.setTimeout(this.proxyTimeout, () => {
            this.activeUpstreamRequests.delete(proxyReq);
            proxyReq.destroy();
            passThrough.destroy();
            if (!clientRes.headersSent) {
              clientRes.writeHead(504, { 'Content-Type': 'application/json' });
              clientRes.end(JSON.stringify({ error: 'Gateway Timeout', message: '上游 API 响应超时' }));
            }
          });

          proxyReq.on('error', (err) => {
            this.activeUpstreamRequests.delete(proxyReq);
            passThrough.destroy();
            if (!clientRes.headersSent) {
              clientRes.writeHead(502, { 'Content-Type': 'application/json' });
              clientRes.end(JSON.stringify({ error: err.message }));
            }
          });

          if (optimizedBody) {
            proxyReq.write(optimizedBody);
          }
          this.activeUpstreamRequests.add(proxyReq);
          proxyReq.on('close', () => this.activeUpstreamRequests.delete(proxyReq));
          proxyReq.end();
          return;
        }

        // 非流式请求：缓冲响应 + 智能重试 + 统计
        let lastError: Error | undefined;
        let upstreamResult: { statusCode: number; headers: http.IncomingHttpHeaders; body: string } | undefined;
        const maxAttempts = requestId ? requestTracker.MAX_RETRIES + 1 : 1;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
            clientRes.end(JSON.stringify({ error: errMsg }));
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
        } else {
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

            // 顺序记录保证数据一致性：统计 → 预算 → 历史
            try {
              await recordStats(handleResult.stats, apiType);
              const actualCost = calculateCost(handleResult.stats.model, handleResult.stats.inputTokens, handleResult.stats.outputTokens);
              await budgetService.updateSpent('daily', actualCost);
              await budgetService.updateSpent('monthly', actualCost);
              await historyService.addRequest({
                apiType,
                model: handleResult.stats.model,
                inputTokens: handleResult.stats.inputTokens,
                outputTokens: handleResult.stats.outputTokens,
                cachedTokens: handleResult.stats.cacheReadTokens + handleResult.stats.cacheCreationTokens,
                cost: actualCost,
                cached: handleResult.stats.cacheReadTokens > 0,
                timestamp: new Date().toISOString()
              });
            } catch (err) {
              logProxy('error', '记录请求统计失败', { requestId, error: (err instanceof Error ? err.message : String(err)) });
            }
          }
        }

        if (!clientRes.headersSent) {
          clientRes.writeHead(statusCode, upstreamResult.headers);
          clientRes.end(upstreamResult.body);
        }
      });

      this.server.on('error', reject);
      this.server.listen(this.port, () => {
        console.log(`TokenBao proxy running on port ${this.port}`);
        console.log(`OpenAI: http://localhost:${this.port}/v1/chat/completions`);
        console.log(`Anthropic: http://localhost:${this.port}/v1/messages`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.shuttingDown = true;

        // 停止接收新连接
        this.server.close(() => {
          this.server = null;
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

  isRunning(): boolean {
    return this.server !== null;
  }

  getPort(): number {
    const addr = this.server?.address();
    return typeof addr === 'object' && addr ? addr.port : this.port;
  }

  updateOptimizationConfig(config: { caching?: boolean; compression?: boolean; routing?: boolean; batching?: boolean }): void {
    setOptimizationConfig(config);
  }

  /** 设置代理请求超时（毫秒） */
  setProxyTimeout(timeout: number): void {
    if (timeout > 0) {
      this.proxyTimeout = timeout;
    }
  }

  getProxyTimeout(): number {
    return this.proxyTimeout;
  }
}

export default ProxyServer;
// 兼容旧引用，从 pricing 模块重新导出
export { calculateCost, normalizeModelName, MODEL_PRICING } from './pricing';
