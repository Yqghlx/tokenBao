declare global {
  interface ElectronAPI {
    proxy: {
      start: (port: number) => Promise<{ success: boolean; port?: number; error?: string }>;
      stop: () => Promise<{ success: boolean; error?: string }>;
      status: () => Promise<{ running: boolean; port: number; requests: number }>;
      setKeys: (openaiKey: string, anthropicKey: string) => Promise<{ success: boolean }>;
    };
    config: {
      get: (key: string) => Promise<string | undefined>;
      set: (key: string, value: string) => Promise<{ success: boolean }>;
      getAll: () => Promise<Record<string, string>>;
    };
    apiKeys: {
      list: () => Promise<Array<{ id: number; name: string; type: string; encryptedKey: string; createdAt: string; updatedAt: string }>>;
      add: (name: string, type: string, key: string) => Promise<{ id: number; name: string; type: string; encryptedKey: string; createdAt: string; updatedAt: string }>;
      delete: (id: number) => Promise<boolean>;
      get: (id: number) => Promise<{ id: number; name: string; type: string; encryptedKey: string; createdAt: string; updatedAt: string } | undefined>;
    };
    history: {
      list: (options?: { limit?: number; offset?: number; apiType?: string }) => Promise<Array<{ id: number; apiType: string; model: string; inputTokens: number; outputTokens: number; cachedTokens: number; cost: number; cached: boolean; timestamp: string }>>;
      clear: () => Promise<{ success: boolean }>;
    };
    budget: {
      get: () => Promise<{ type: string; limit: number; spent: number }>;
      set: (type: string, limit: number) => Promise<{ success: boolean }>;
      status: () => Promise<{ type: string; limit: number; spent: number; remaining: number; percentage: number }>;
    };
    stats: {
      summary: () => Promise<{
        totalRequests: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        totalCachedTokens: number;
        totalCost: number;
        byApi: Record<string, { requests: number; tokens: number; cost: number }>;
        byModel: Record<string, { requests: number; tokens: number; cost: number }>;
      }>;
    };
    optimization: {
      getConfig: () => Promise<{ caching: boolean; compression: boolean; routing: boolean; batching: boolean }>;
      setConfig: (config: Record<string, unknown>) => Promise<{ success: boolean; config: Record<string, unknown> }>;
    };
    on: (channel: string, callback: (...args: unknown[]) => void) => void;
    off: (channel: string) => void;
  }

  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};