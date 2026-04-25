import http from 'http';
import https from 'https';
import { applyOptimizations, setOptimizationConfig } from '../optimizations/index';
import * as statsService from '../services/stats';
import * as budgetService from '../services/budget';

interface ProxyConfig {
  port: number;
  openaiKey?: string;
  anthropicKey?: string;
}

type ApiType = 'openai' | 'anthropic' | 'unknown';

const OPENAI_BASE = 'https://api.openai.com';
const ANTHROPIC_BASE = 'https://api.anthropic.com';

const PROXY_TIMEOUT = 60000;

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
              
              console.log(`优化策略: ${result.appliedStrategies.join(', ')}`);
              console.log(`节省 Tokens: ${savedTokens} (累计: ${this.totalSavedTokens})`);
              
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

        const options = {
          hostname: targetBase.replace('https://', ''),
          port: 443,
          path: path,
          method: clientReq.method,
          headers: headers
        };

        const proxyReq = https.request(options, (proxyRes) => {
          clientRes.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
          proxyRes.pipe(clientRes);
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