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
 * 数据来源：OpenAI 和 Anthropic 官方定价
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
};

/**
 * 计算 API 调用费用
 */
function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || { input: 0.001, output: 0.002 };
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}

/**
 * 向上游 API 发送请求，返回响应状态码、响应头和响应体
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
        // 始终替换为代理配置的 Key，不透传客户端原始凭证
        if (apiType === 'anthropic' && this.anthropicKey) {
          result['x-api-key'] = this.anthropicKey;
        } else if (apiType === 'openai' && this.openaiKey) {
          result['authorization'] = `Bearer ${this.openaiKey}`;
        }
        // 未配置代理 Key 时不发送认证头，避免泄漏客户端凭证
      } else if (key.toLowerCase() === 'x-api-key') {
        // 同样替换 Anthropic 的 x-api-key
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

        const path = clientReq.url || '';
        const apiType = this.detectApiType(path);
        const targetBase = this.getTargetBase(apiType);

        console.log(`[${apiType}] ${clientReq.method} ${path}`);

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

              console.log(`[${requestId}] 优化策略: ${result.appliedStrategies.join(', ')}`);
              console.log(`[${requestId}] 节省 Tokens: ${savedTokens} (累计: ${this.totalSavedTokens})`);

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
            // JSON 解析失败，直接转发原始请求
          }
        }

        const options: https.RequestOptions = {
          hostname: targetBase.replace('https://', ''),
          port: 443,
          path: path,
          method: clientReq.method,
          headers: headers
        };

        // 带重试的上游请求

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
              // 等待重试间隔
              await new Promise(r => setTimeout(r, requestTracker.RETRY_DELAY));
            }
          }
        }

        if (lastError) {
          // 所有重试耗尽
          console.error('代理请求失败:', lastError.message);
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
          console.error(`请求失败: status=${statusCode}`);
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
        this.server.close(() => {
          this.server = null;
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
export { calculateCost, MODEL_PRICING };