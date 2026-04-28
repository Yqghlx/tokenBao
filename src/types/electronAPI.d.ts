/**
 * 渲染进程 window.electronAPI 类型声明
 * 与 src/main/preload.ts 中 exposeInMainWorld 的 API 保持同步
 */

/** preload 验证失败时的通用错误返回 */
interface PreloadError {
  success: false;
  error: string;
}

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
  cacheMetrics: { hits: number; misses: number; size: number; hitRate: number };
}

interface ApiKeyItem {
  id: number;
  name: string;
  type: string;
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
    setKeys: (openaiKey: string, anthropicKey: string) => Promise<{ success: boolean; error?: string }>;
  };

  config: {
    get: (key: string) => Promise<string | undefined>;
    set: (key: string, value: string) => Promise<{ success: boolean; error?: string }>;
    getAll: () => Promise<Record<string, string>>;
    reset: () => Promise<{ success: boolean; error?: string }>;
  };

  apiKeys: {
    list: () => Promise<ApiKeyItem[]>;
    add: (name: string, type: string, key: string) => Promise<ApiKeyItem | PreloadError>;
    delete: (id: number) => Promise<boolean | PreloadError>;
    get: (id: number) => Promise<ApiKeyItem | null>;
  };

  history: {
    list: (options?: { limit?: number; offset?: number; apiType?: string; search?: string }) => Promise<HistoryRequest[]>;
    count: (options?: { apiType?: string; search?: string }) => Promise<number>;
    clear: () => Promise<{ success: boolean }>;
  };

  budget: {
    get: () => Promise<BudgetInfo>;
    set: (type: string, limit: number) => Promise<BudgetInfo | PreloadError>;
    status: () => Promise<BudgetStatus>;
    resetSpent: (type: 'daily' | 'monthly') => Promise<{ success: boolean; error?: string }>;
  };

  stats: {
    summary: () => Promise<StatsSummary>;
    reset: () => Promise<{ success: boolean }>;
  };

  optimization: {
    getConfig: () => Promise<Record<string, boolean>>;
    setConfig: (config: Record<string, unknown>) => Promise<{ success: boolean; config: Record<string, unknown>; error?: string }>;
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

  dlp: {
    getRules: () => Promise<Array<{ id: string; name: string; enabled: boolean; severity: string }>>;
    setEnabled: (ruleId: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  };

  on: (channel: 'proxy:statusChanged' | 'proxy:error' | 'stats:updated' | 'budget:changed', callback: (...args: unknown[]) => void) => void;
  off: (channel: 'proxy:statusChanged' | 'proxy:error' | 'stats:updated' | 'budget:changed', callback?: (...args: unknown[]) => void) => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
