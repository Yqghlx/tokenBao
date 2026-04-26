import http from 'http';
import https from 'https';
import { applyOptimizations, setOptimizationConfig } from '../optimizations/index';
import * as statsService from '../services/stats';
import * as budgetService from '../services/budget';
import { handleResponse, recordStats } from './responseHandler';
import requestTracker from './requestTracker';

interface ApiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface ApiResponse {
  usage?: ApiUsage;
  model?: string;
}

interface ProxyConfig {
  port: number;
  openaiKey?: string;
  anthropicKey?: string;
}

type ApiType = 'openai' | 'anthropic' | 'unknown';

const OPENAI_BASE = 'https://api.openai.com';
const ANTHROPIC_BASE = 'https://api.anthropic.com';

const PROXY_TIMEOUT = 60000;

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
        if (apiType === 'anthropic' && this.anthropicKey) {
          result['x-api-key'] = this.anthropicKey;
        } else if (apiType === 'openai' && this.openaiKey) {
          result['authorization'] = `Bearer ${this.openaiKey}`;
        } else if (stringValue) {
          result[key] = stringValue;
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
    return new Promise((resolve) => {
      const chunks: string[] = [];
      req.on('data', (chunk) => chunks.push(chunk.toString()));
      req.on('end', () => resolve(chunks.join('')));
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
        const rawBody = await this.collectBody(clientReq);

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
              
              console.log(`[${requestMeta.requestId}] 优化策略: ${result.appliedStrategies.join(', ')}`);
              console.log(`[${requestMeta.requestId}] 节省 Tokens: ${savedTokens} (累计: ${this.totalSavedTokens})`);
              
              await statsService.recordRequest({
                apiType,
                model: parsed.model || 'unknown',
                originalTokens: result.originalTokens,
                optimizedTokens: result.optimizedTokens,
                savedTokens: savedTokens,
                strategies: result.appliedStrategies
              });
              
              (parsed as any).__requestId = requestMeta.requestId;
              
              const estimatedCost = result.optimizedTokens / 1000 * 0.001;
              await budgetService.updateSpent('daily', estimatedCost);
              await budgetService.updateSpent('monthly', estimatedCost);
            }
          } catch (e) {
            // JSON 解析失败，直接转发原始请求
          }
        }

        const options = {
          hostname: targetBase.replace('https://', ''),
          port: 443,
          path: path,
          method: clientReq.method,
          headers: headers
        };

        const proxyReq = https.request(options, (proxyRes) => {
          const chunks: Buffer[] = [];
          proxyRes.on('data', (chunk) => chunks.push(chunk));
          proxyRes.on('end', () => {
            const responseBody = Buffer.concat(chunks).toString();
            const headers = proxyRes.headers as Record<string, string>;
            const statusCode = proxyRes.statusCode || 500;
            
            let requestId: string | undefined;
            try {
              const bodyParsed = JSON.parse(optimizedBody);
              requestId = bodyParsed.__requestId;
            } catch {}
            
            if (statusCode >= 400) {
              console.error(`请求失败: status=${statusCode}`);
              if (requestId) {
                requestTracker.failRequest(requestId, responseBody, statusCode);
              }
            } else {
              const result = handleResponse(responseBody, headers, apiType);
              
              if (result.stats && requestId) {
                requestTracker.completeRequest(requestId, {
                  requestId,
                  inputTokens: result.stats.inputTokens,
                  outputTokens: result.stats.outputTokens,
                  cacheReadTokens: result.stats.cacheReadTokens,
                  cacheCreationTokens: result.stats.cacheCreationTokens,
                  cost: calculateCost(result.stats.model, result.stats.inputTokens, result.stats.outputTokens),
                  model: result.stats.model,
                  duration: 0,
                  status: statusCode
                });
                
                recordStats(result.stats, apiType).catch(err => console.error('记录统计失败:', err));
              }
            }
            
            clientRes.writeHead(statusCode, proxyRes.headers);
            clientRes.end(responseBody);
          });
        });

        proxyReq.setTimeout(PROXY_TIMEOUT, () => {
          console.error('请求超时:', path);
          proxyReq.destroy();
          if (!clientRes.headersSent) {
            clientRes.writeHead(504, { 'Content-Type': 'application/json' });
            clientRes.end(JSON.stringify({ error: 'Gateway Timeout', message: '上游 API 响应超时' }));
          }
        });

        proxyReq.on('error', (err) => {
          console.error('Proxy error:', err.message);
          
          let requestId: string | undefined;
          try {
            const bodyParsed = JSON.parse(optimizedBody);
            requestId = bodyParsed.__requestId;
          } catch {}
          
          if (requestId && requestTracker.canRetry(requestId)) {
            const retryCount = requestTracker.incrementRetry(requestId);
            console.log(`[${requestId}] 重试请求 (${retryCount}/${requestTracker.MAX_RETRIES})`);
            
            setTimeout(() => {
              const metadata = requestTracker.getRequestMetadata(requestId);
              if (metadata) {
                console.log(`[${requestId}] 重试中...`);
                requestTracker.updateRequestStatus(requestId, 'retrying');
              }
            }, requestTracker.RETRY_DELAY);
          } else if (requestId) {
            requestTracker.failRequest(requestId, err.message, 502);
          }
          
          if (!clientRes.headersSent) {
            clientRes.writeHead(502, { 'Content-Type': 'application/json' });
            clientRes.end(JSON.stringify({ error: err.message }));
          }
        });

        if (optimizedBody) {
          proxyReq.write(optimizedBody);
        }
        proxyReq.end();
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

  updateOptimizationConfig(config: { caching?: boolean; compression?: boolean; routing?: boolean; batching?: boolean }): void {
    setOptimizationConfig(config);
  }
}

export default ProxyServer;
export { calculateCost, MODEL_PRICING };