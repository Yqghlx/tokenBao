interface ApiRequest {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

interface ApiResponse {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

type RequestHook = (req: ApiRequest, data?: unknown) => ApiRequest | undefined;
type ResponseHook = (req: ApiRequest, res: ApiResponse, data?: unknown) => void;

interface InterceptorConfig {
  name: string;
  enabled: boolean;
  priority: number;
}

class RequestInterceptor {
  private preHooks: RequestHook[] = [];
  private postHooks: ResponseHook[] = [];
  private configs: Map<string, InterceptorConfig> = new Map();

  registerPreHook(name: string, hook: RequestHook, priority = 100): void {
    this.configs.set(name, { name, enabled: true, priority });
    this.preHooks.push(hook);
    this.preHooks.sort((_a, _b) => priority - 100);
  }

  registerPostHook(name: string, hook: ResponseHook, priority = 100): void {
    this.configs.set(name, { name, enabled: true, priority });
    this.postHooks.push(hook);
    this.postHooks.sort((_a, _b) => priority - 100);
  }

  async executePreHooks(req: ApiRequest): Promise<ApiRequest> {
    let result = req;
    for (const hook of this.preHooks) {
      const config = Array.from(this.configs.values()).find(c => c.name === hook.name);
      if (config?.enabled !== false) {
        const hookResult = await hook(result);
        if (hookResult !== undefined) {
          result = hookResult;
        }
      }
    }
    return result;
  }

  async executePostHooks(req: ApiRequest, res: ApiResponse): Promise<void> {
    for (const hook of this.postHooks) {
      const config = Array.from(this.configs.values()).find(c => c.name === hook.name);
      if (config?.enabled !== false) {
        await hook(req, res);
      }
    }
  }

  getConfig(name: string): InterceptorConfig | undefined {
    return this.configs.get(name);
  }

  setEnabled(name: string, enabled: boolean): void {
    const config = this.configs.get(name);
    if (config) {
      config.enabled = enabled;
    }
  }

  listConfigs(): InterceptorConfig[] {
    return Array.from(this.configs.values());
  }
}

export default RequestInterceptor;
export type { RequestHook, ResponseHook, InterceptorConfig, ApiRequest, ApiResponse };