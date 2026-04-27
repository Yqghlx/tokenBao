import http from 'http';
import https from 'https';
import { applyOptimizations, setOptimizationConfig } from '../optimizations/index';
import * as statsService from '../services/stats';
import * as budgetService from '../services/budget';
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

const PROXY_TIMEOUT = 60000;
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 请求体最大 10MB

/**
 * 模型定价表（每 1000 tokens 价格，美元）
 * 数据来源：OpenAI / Anthropic 官方定价，2026 年 4 月更新
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4.1': { input: 0.002, output: 0.008 },
  'gpt-4.1-mini': { input: 0.0004, output: 0.0016 },
  'gpt-4.1-nano': { input: 0.0001, output: 0.0004 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'o3': { input: 0.002, output: 0.008 },
  'o4-mini': { input: 0.0011, output: 0.0044 },
  // Anthropic
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3.5-haiku': { input: 0.001, output: 0.005 },
  'claude-sonnet-4': { input: 0.003, output: 0.015 },
  'claude-opus-4': { input: 0.005, output: 0.025 },
};

/**
 * 模型名称归一化映射
 * API 返回的 model 可能包含日期后缀（如 gpt-4-0613）或变体名，需归一化到定价表标准名
 */
const MODEL_ALIASES: Record<string, string> = {
  // OpenAI 变体
  'gpt-4-0314': 'gpt-4', 'gpt-4-0613': 'gpt-4', 'gpt-4-1106-preview': 'gpt-4-turbo',
  'gpt-4-0125-preview': 'gpt-4-turbo', 'gpt-4-turbo-preview': 'gpt-4-turbo',
  'gpt-4-turbo-2024-04-09': 'gpt-4-turbo',
  'gpt-4o-2024-05-13': 'gpt-4o', 'gpt-4o-2024-08-06': 'gpt-4o', 'gpt-4o-2024-11-20': 'gpt-4o',
  'gpt-4o-mini-2024-07-18': 'gpt-4o-mini',
  'gpt-3.5-turbo-0125': 'gpt-3.5-turbo', 'gpt-3.5-turbo-1106': 'gpt-3.5-turbo',
  'gpt-3.5-turbo-16k': 'gpt-3.5-turbo',
  // Anthropic 变体
  'claude-3-opus-20240229': 'claude-3-opus',
  'claude-3-sonnet-20240229': 'claude-3-sonnet',
  'claude-3-haiku-20240307': 'claude-3-haiku',
  'claude-3-5-sonnet-20240620': 'claude-3.5-sonnet',
  'claude-3-5-sonnet-20241022': 'claude-3.5-sonnet',
  'claude-3-5-haiku-20241022': 'claude-3.5-haiku',
};

function normalizeModelName(model: string): string {
  if (!model) return 'unknown';
  const lower = model.toLowerCase();
  // 精确匹配别名
  if (MODEL_ALIASES[lower]) return MODEL_ALIASES[lower];
  // 直接命中定价表
  if (MODEL_PRICING[lower]) return lower;
  // 前缀匹配：取最长的匹配
  for (const key of Object.keys(MODEL_PRICING)) {
    if (lower.startsWith(key)) return key;
  }
  return model;
}

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const normalized = normalizeModelName(model);
  const pricing = MODEL_PRICING[normalized] || { input: 0.001, output: 0.002 };
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}

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

/**
 * 向上游 API 发送请求，返回完整响应（非流式）
 */
function sendUpstream(
  options: https.RequestOptions,
  body: string
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 500,
          headers: res.headers,
          body: Buffer.concat(chunks).toString()
        });
      });
    });

    req.setTimeout(PROXY_TIMEOUT, () => {
      req.destroy(new Error('上游 API 响应超时'));
    });

    req.on('error', reject);

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

  constructor(config: ProxyConfig) {
    this.port = config.port;
    this.openaiKey = config.openaiKey;
    this.anthropicKey = config.anthropicKey;
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
      req.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > MAX_BODY_SIZE) {
          req.destroy();
          reject(new Error(`请求体超过最大限制 (${MAX_BODY_SIZE / 1024 / 1024}MB)`));
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
      req.on('error', reject);
    });
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (clientReq, clientRes) => {
        this.requestCount++;
        this.activeConnections.add(clientRes);
        clientRes.on('close', () => this.activeConnections.delete(clientRes));

        const path = clientReq.url || '';
        const apiType = this.detectApiType(path);
        const targetBase = this.getTargetBase(apiType);

        logProxy('info', `${clientReq.method} ${path}`, { apiType, method: clientReq.method });

        const headers = this.transformHeaders(clientReq.headers, apiType);
        let rawBody: string;
        try {
          rawBody = await this.collectBody(clientReq);
        } catch (err: any) {
          if (!clientRes.headersSent) {
            clientRes.writeHead(413, { 'Content-Type': 'application/json' });
            clientRes.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        let optimizedBody = rawBody;
        let savedTokens = 0;
        let requestId: string | undefined;

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

              await statsService.recordRequest({
                apiType,
                model: parsed.model || 'unknown',
                originalTokens: result.originalTokens,
                optimizedTokens: result.optimizedTokens,
                savedTokens: savedTokens,
                strategies: result.appliedStrategies
              });

              const estimatedCost = result.optimizedTokens / 1000 * 0.001;
              await budgetService.updateSpent('daily', estimatedCost);
              await budgetService.updateSpent('monthly', estimatedCost);
            }
          } catch (e) {
            // JSON 解析或优化失败，直接转发原始请求
            logProxy('warn', '优化管线处理失败，转发原始请求', { error: (e as Error).message });
          }
        }

        const options: https.RequestOptions = {
          hostname: targetBase.replace('https://', ''),
          port: 443,
          path: path,
          method: clientReq.method,
          headers: headers
        };

        // 流式请求：直接 pipe 转发，不缓冲响应
        if (isStreamRequest(rawBody)) {
          const proxyReq = https.request(options, (proxyRes) => {
            const statusCode = proxyRes.statusCode || 500;
            if (statusCode >= 400) {
              console.error(`流式请求失败: status=${statusCode}`);
            }
            clientRes.writeHead(statusCode, proxyRes.headers);
            proxyRes.pipe(clientRes);
          });

          proxyReq.setTimeout(PROXY_TIMEOUT, () => {
            proxyReq.destroy();
            if (!clientRes.headersSent) {
              clientRes.writeHead(504, { 'Content-Type': 'application/json' });
              clientRes.end(JSON.stringify({ error: 'Gateway Timeout', message: '上游 API 响应超时' }));
            }
          });

          proxyReq.on('error', (err) => {
            console.error('流式代理错误:', err.message);
            if (!clientRes.headersSent) {
              clientRes.writeHead(502, { 'Content-Type': 'application/json' });
              clientRes.end(JSON.stringify({ error: err.message }));
            }
          });

          if (optimizedBody) {
            proxyReq.write(optimizedBody);
          }
          proxyReq.end();
          return;
        }

        // 非流式请求：缓冲响应 + 重试 + 统计
        let lastError: Error | undefined;
        let upstreamResult: { statusCode: number; headers: http.IncomingHttpHeaders; body: string } | undefined;
        const maxAttempts = requestId ? requestTracker.MAX_RETRIES + 1 : 1;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            upstreamResult = await sendUpstream(options, optimizedBody);
            lastError = undefined;
            break;
          } catch (err: any) {
            lastError = err;
            if (requestId && attempt < maxAttempts - 1) {
              const retryCount = requestTracker.incrementRetry(requestId);
              console.log(`[${requestId}] 重试请求 (${retryCount}/${requestTracker.MAX_RETRIES})`);
              requestTracker.updateRequestStatus(requestId, 'retrying');
              await new Promise(r => setTimeout(r, requestTracker.RETRY_DELAY));
            }
          }
        }

        if (lastError) {
          logProxy('error', `代理请求失败`, { requestId, error: lastError.message });
          if (requestId) {
            requestTracker.failRequest(requestId, lastError.message, 502);
          }
          if (!clientRes.headersSent) {
            clientRes.writeHead(502, { 'Content-Type': 'application/json' });
            clientRes.end(JSON.stringify({ error: lastError.message }));
          }
          return;
        }

        if (!upstreamResult) return;

        const statusCode = upstreamResult.statusCode;

        if (statusCode >= 400) {
          logProxy('error', `请求失败`, { requestId, statusCode });
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

            recordStats(handleResult.stats, apiType).catch(err => console.error('记录统计失败:', err));
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
        // 关闭所有活跃连接，避免挂起
        for (const res of this.activeConnections) {
          if (!res.writableEnded) {
            res.end();
          }
        }
        this.activeConnections.clear();

        this.server.close(() => {
          this.server = null;
          logProxy('info', '代理服务器已关闭');
          resolve();
        });
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
}

export default ProxyServer;
export { calculateCost, normalizeModelName, MODEL_PRICING };
