/**
 * 渲染进程 window.electronAPI 类型声明
 * 与 src/main/preload.ts 中 exposeInMainWorld 的 API 保持同步
 * 与 src/types/electronAPI.d.ts 为同一接口的渲染进程副本
 */

declare global {
  interface ElectronAPI {
    proxy: {
      start: (port?: number) => Promise<{ success: boolean; port?: number; error?: string }>;
      stop: () => Promise<{ success: boolean; error?: string }>;
      status: () => Promise<{ running: boolean; port: number; requests: number }>;
      health: () => Promise<{
        status: 'healthy' | 'not_running';
        uptime: number;
        activeConnections: number;
        requestCount: number;
      }>;
      setKeys: (openaiKey: string, anthropicKey: string) => Promise<{ success: boolean; error?: string }>;
    };

    config: {
      get: (key: string) => Promise<string | undefined>;
      set: (key: string, value: string) => Promise<{ success: boolean; error?: string }>;
      getAll: () => Promise<Record<string, string>>;
      reset: () => Promise<{ success: boolean; error?: string }>;
    };

    apiKeys: {
      list: () => Promise<Array<{ id: number; name: string; type: string; createdAt: string; updatedAt: string }>>;
      add: (name: string, type: string, key: string) => Promise<{ id: number; name: string; type: string; createdAt: string; updatedAt: string } | { success: false; error: string }>;
      delete: (id: number) => Promise<boolean | { success: false; error: string }>;
      get: (id: number) => Promise<{ id: number; name: string; type: string; createdAt: string; updatedAt: string } | null>;
    };

    history: {
      list: (options?: { limit?: number; offset?: number; apiType?: string; search?: string }) => Promise<Array<{
        id: number;
        apiType: string;
        model: string;
        inputTokens: number;
        outputTokens: number;
        cachedTokens: number;
        cost: number;
        cached: boolean;
        timestamp: string;
      }>>;
      count: (options?: { apiType?: string; search?: string }) => Promise<number>;
      clear: () => Promise<{ success: boolean }>;
    };

    budget: {
      get: () => Promise<{ type: string; limit: number; spent: number }>;
      set: (type: string, limit: number) => Promise<{ type: string; limit: number; spent: number } | { success: false; error: string }>;
      status: () => Promise<{
        daily: { limit: number; spent: number; remaining: number; percentage: number };
        monthly: { limit: number; spent: number; remaining: number; percentage: number };
      }>;
      resetSpent: (type: 'daily' | 'monthly') => Promise<{ success: boolean; error?: string }>;
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
      reset: () => Promise<{ success: boolean }>;
    };

    optimization: {
      getConfig: () => Promise<Record<string, boolean>>;
      setConfig: (config: Record<string, unknown>) => Promise<{ success: boolean; config?: Record<string, unknown>; error?: string }>;
    };

    rules: {
      list: () => Promise<Array<{
        id: number;
        name: string;
        type: 'replace' | 'filter' | 'route';
        pattern: string;
        replacement: string;
        enabled: boolean;
        priority: number;
      }>>;
      add: (rule: { name: string; type: string; pattern: string; replacement: string; enabled: boolean; priority: number }) => Promise<{ success: boolean; rule?: unknown; error?: string }>;
      update: (id: number, updates: Record<string, unknown>) => Promise<{ success: boolean; rule?: unknown; error?: string }>;
      delete: (id: number) => Promise<{ success: boolean; error?: string }>;
      validate: (pattern: string) => Promise<{ error: string | null }>;
    };

    on: (channel: 'proxy:statusChanged' | 'proxy:error' | 'stats:updated' | 'budget:changed', callback: (...args: unknown[]) => void) => void;
    off: (channel: 'proxy:statusChanged' | 'proxy:error' | 'stats:updated' | 'budget:changed', callback?: (...args: unknown[]) => void) => void;
  }

  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
