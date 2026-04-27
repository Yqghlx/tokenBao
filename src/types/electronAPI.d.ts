/**
 * 渲染进程 window.electronAPI 类型声明
 * 与 src/main/preload.ts 中 exposeInMainWorld 的 API 保持同步
 */

interface ProxyStatus {
  running: boolean;
  port: number;
  requests: number;
}

interface ProxyHealth {
  status: 'healthy' | 'not_running';
  uptime: number;
  activeConnections: number;
  requestCount: number;
}

interface BudgetInfo {
  type: string;
  limit: number;
  spent: number;
}

interface BudgetStatus {
  daily: { limit: number; spent: number; remaining: number; percentage: number };
  monthly: { limit: number; spent: number; remaining: number; percentage: number };
}

interface StatsSummary {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalCost: number;
  byApi: Record<string, { requests: number; tokens: number; cost: number }>;
  byModel: Record<string, { requests: number; tokens: number; cost: number }>;
}

interface ApiKeyItem {
  id: number;
  name: string;
  type: string;
  encryptedKey: string;
  createdAt: string;
  updatedAt: string;
}

interface HistoryRequest {
  id: number;
  apiType: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number;
  cached: boolean;
  timestamp: string;
}

interface ElectronAPI {
  proxy: {
    start: (port?: number) => Promise<{ success: boolean; port?: number; error?: string }>;
    stop: () => Promise<{ success: boolean; error?: string }>;
    status: () => Promise<ProxyStatus>;
    health: () => Promise<ProxyHealth>;
    setKeys: (openaiKey: string, anthropicKey: string) => Promise<{ success: boolean }>;
  };

  config: {
    get: (key: string) => Promise<string | undefined>;
    set: (key: string, value: string) => Promise<{ success: boolean }>;
    getAll: () => Promise<Record<string, string>>;
    reset: () => Promise<{ success: boolean }>;
  };

  apiKeys: {
    list: () => Promise<Omit<ApiKeyItem, 'encryptedKey'>[]>;
    add: (name: string, type: string, key: string) => Promise<ApiKeyItem>;
    delete: (id: number) => Promise<boolean>;
    get: (id: number) => Promise<ApiKeyItem | undefined>;
  };

  history: {
    list: (options?: { limit?: number; offset?: number; apiType?: string; search?: string }) => Promise<HistoryRequest[]>;
    count: (options?: { apiType?: string; search?: string }) => Promise<number>;
    clear: () => Promise<{ success: boolean }>;
  };

  budget: {
    get: () => Promise<BudgetInfo>;
    set: (type: string, limit: number) => Promise<BudgetInfo>;
    status: () => Promise<BudgetStatus>;
    resetSpent: (type: 'daily' | 'monthly') => Promise<{ success: boolean }>;
  };

  stats: {
    summary: () => Promise<StatsSummary>;
    reset: () => Promise<{ success: boolean }>;
  };

  optimization: {
    getConfig: () => Promise<Record<string, boolean>>;
    setConfig: (config: Record<string, unknown>) => Promise<{ success: boolean; config: Record<string, unknown> }>;
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
    delete: (id: number) => Promise<{ success: boolean }>;
    validate: (pattern: string) => Promise<{ error: string | null }>;
  };

  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  off: (channel: string) => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
