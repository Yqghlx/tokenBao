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

const PROXY_TIMEOUT = 60000;
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 请求体最大 10MB

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

              await statsService.recordOptimization({
                apiType,
                model: parsed.model || 'unknown',
                savedTokens: savedTokens,
              });
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

        // 流式请求：pipe 转发 + 拦截 SSE 提取 usage 统计
        if (isStreamRequest(rawBody)) {
          let parsedModel = 'unknown';
          try { parsedModel = JSON.parse(rawBody).model || 'unknown'; } catch { /* 非法 JSON，使用默认模型名 */ }

          const proxyReq = https.request(options, (proxyRes) => {
            const statusCode = proxyRes.statusCode || 500;
            if (statusCode >= 400) {
              logProxy('error', `流式请求失败`, { statusCode });
            }
            clientRes.writeHead(statusCode, proxyRes.headers);

            // 用 PassThrough 拦截数据流：一边转发一边提取 usage
            let sseBuffer = '';
            const passThrough = new PassThrough();
            passThrough.on('data', (chunk: Buffer) => {
              sseBuffer += chunk.toString();
              // 只保留最后 10KB 用于提取 usage，避免内存增长
              if (sseBuffer.length > 10240) {
                sseBuffer = sseBuffer.slice(-10240);
              }
            });
            passThrough.on('end', () => {
              // 流结束后从 SSE 数据中提取 usage
              if (statusCode < 400) {
                try {
                  const usage = extractStreamUsage(sseBuffer, apiType);
                  if (usage) {
                    const cost = calculateCost(usage.model || parsedModel, usage.inputTokens, usage.outputTokens);
                    statsService.addStats({
                      apiType,
                      model: usage.model || parsedModel,
                      inputTokens: usage.inputTokens,
                      outputTokens: usage.outputTokens,
                      cachedTokens: usage.cacheReadTokens + usage.cacheCreationTokens,
                      cost
                    }).catch(err => logProxy('error', '流式统计记录失败', { error: err.message }));

                    budgetService.updateSpent('daily', cost).catch(() => { /* 预算更新失败不阻断流程 */ });
                    budgetService.updateSpent('monthly', cost).catch(() => { /* 预算更新失败不阻断流程 */ });

                    logProxy('info', `流式请求统计`, { model: usage.model || parsedModel, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cost: cost.toFixed(4) });

                    historyService.addRequest({
                      apiType,
                      model: usage.model || parsedModel,
                      inputTokens: usage.inputTokens,
                      outputTokens: usage.outputTokens,
                      cachedTokens: usage.cacheReadTokens + usage.cacheCreationTokens,
                      cost,
                      cached: usage.cacheReadTokens > 0,
                      timestamp: new Date().toISOString()
                    }).catch(() => { /* 历史记录写入失败不阻断流程 */ });
                  }
                } catch {
                  // usage 提取失败不影响功能
                }
              }
            });

            proxyRes.pipe(passThrough).pipe(clientRes);
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

            const actualCost = calculateCost(handleResult.stats.model, handleResult.stats.inputTokens, handleResult.stats.outputTokens);
            budgetService.updateSpent('daily', actualCost).catch(() => { /* 预算更新失败不阻断流程 */ });
            budgetService.updateSpent('monthly', actualCost).catch(() => { /* 预算更新失败不阻断流程 */ });

            historyService.addRequest({
              apiType,
              model: handleResult.stats.model,
              inputTokens: handleResult.stats.inputTokens,
              outputTokens: handleResult.stats.outputTokens,
              cachedTokens: handleResult.stats.cacheReadTokens + handleResult.stats.cacheCreationTokens,
              cost: actualCost,
              cached: handleResult.stats.cacheReadTokens > 0,
              timestamp: new Date().toISOString()
            }).catch(() => { /* 历史记录写入失败不阻断流程 */ });
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
// 兼容旧引用，从 pricing 模块重新导出
export { calculateCost, normalizeModelName, MODEL_PRICING } from './pricing';
