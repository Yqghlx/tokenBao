/**
 * 全局 mock window.electronAPI
 * 方法名和返回值结构与 src/renderer/types.d.ts 中 ElectronAPI 接口保持同步
 * 每个测试文件可通过 jest.fn() 覆盖具体返回值
 */
const mockElectronAPI = {
  proxy: {
    start: jest.fn(() => Promise.resolve({ success: true, port: 3000 })),
    stop: jest.fn(() => Promise.resolve({ success: true })),
    status: jest.fn(() => Promise.resolve({
      running: false,
      port: 3000,
      requests: 0,
    })),
    health: jest.fn(() => Promise.resolve({
      status: 'not_running' as const,
      uptime: 0,
      activeConnections: 0,
      requestCount: 0,
    })),
    setKeys: jest.fn(() => Promise.resolve({ success: true })),
  },
  config: {
    getAll: jest.fn(() => Promise.resolve({
      proxyPort: '3000',
      dataRetentionDays: '30',
      cacheTTL: '5min',
    })),
    get: jest.fn(() => Promise.resolve('')),
    set: jest.fn(() => Promise.resolve({ success: true })),
    reset: jest.fn(() => Promise.resolve({ success: true })),
  },
  apiKeys: {
    list: jest.fn(() => Promise.resolve([])),
    add: jest.fn(() => Promise.resolve({ id: 1, name: 'test', type: 'openai', createdAt: '2024-01-01', updatedAt: '2024-01-01' })),
    delete: jest.fn(() => Promise.resolve(true)),
    get: jest.fn(() => Promise.resolve(null)),
  },
  history: {
    list: jest.fn(() => Promise.resolve([])),
    count: jest.fn(() => Promise.resolve(0)),
    clear: jest.fn(() => Promise.resolve({ success: true })),
  },
  budget: {
    get: jest.fn(() => Promise.resolve({ type: 'monthly', limit: 100, spent: 0 })),
    set: jest.fn(() => Promise.resolve({ type: 'monthly', limit: 100, spent: 0 })),
    status: jest.fn(() => Promise.resolve({
      daily: { limit: 10, spent: 0, remaining: 10, percentage: 0 },
      monthly: { limit: 100, spent: 0, remaining: 100, percentage: 0 },
    })),
    resetSpent: jest.fn(() => Promise.resolve({ success: true })),
  },
  stats: {
    summary: jest.fn(() => Promise.resolve({
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCachedTokens: 0,
      totalCost: 0,
      byApi: {},
      byModel: {},
      cacheMetrics: { hits: 0, misses: 0, size: 0, hitRate: 0 },
    })),
    reset: jest.fn(() => Promise.resolve({ success: true })),
  },
  optimization: {
    getConfig: jest.fn(() => Promise.resolve({
      caching: true,
      compression: true,
      routing: true,
      batching: false,
      rules: true,
      dlp: false,
    })),
    setConfig: jest.fn(() => Promise.resolve({ success: true })),
  },
  rules: {
    list: jest.fn(() => Promise.resolve([])),
    add: jest.fn(() => Promise.resolve({ success: true })),
    update: jest.fn(() => Promise.resolve({ success: true })),
    delete: jest.fn(() => Promise.resolve({ success: true })),
    validate: jest.fn(() => Promise.resolve({ error: null })),
  },
  dlp: {
    getRules: jest.fn(() => Promise.resolve([])),
    setEnabled: jest.fn(() => Promise.resolve({ success: true })),
  },
  on: jest.fn(),
  off: jest.fn(),
};

Object.defineProperty(window, 'electronAPI', {
  writable: true,
  value: mockElectronAPI,
});

// Mock __APP_VERSION__ 全局常量
Object.defineProperty(globalThis, '__APP_VERSION__', {
  writable: true,
  value: '1.1.3',
});
