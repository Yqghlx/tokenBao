import { contextBridge, ipcRenderer } from 'electron';

/** 允许渲染进程监听的安全通道白名单 */
const ALLOWED_CHANNELS = [
  'proxy:statusChanged',
  'proxy:error',
  'stats:updated',
] as const;

/** 合法的 API 密钥类型 */
const VALID_KEY_TYPES = ['openai', 'anthropic'] as const;

/** 合法的预算类型 */
const VALID_BUDGET_TYPES = ['daily', 'monthly'] as const;

/** 有效的配置键白名单 */
const VALID_CONFIG_KEYS = ['proxyPort', 'dataRetentionDays', 'cacheTTL'] as const;

/** 优化配置允许的属性白名单 */
const VALID_OPTIM_KEYS = ['caching', 'compression', 'routing', 'batching'] as const;

/** 检测字符串中是否含有控制字符（\x00-\x1F 除 \t\n\r 外，以及 \x7F） */
function hasControlChars(str: string): boolean {
  return /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(str);
}

contextBridge.exposeInMainWorld('electronAPI', {
  proxy: {
    start: (port?: number) => {
      if (port !== undefined && (typeof port !== 'number' || port < 1024 || port > 65535)) {
        return Promise.resolve({ success: false, error: '端口范围应为 1024-65535' });
      }
      return ipcRenderer.invoke('proxy:start', port);
    },
    stop: () => ipcRenderer.invoke('proxy:stop'),
    status: () => ipcRenderer.invoke('proxy:status'),
    setKeys: (openaiKey: string, anthropicKey: string) => {
      if (typeof openaiKey !== 'string' || typeof anthropicKey !== 'string') {
        return Promise.resolve({ success: false, error: '密钥必须为字符串' });
      }
      if (openaiKey.length > 500 || anthropicKey.length > 500) {
        return Promise.resolve({ success: false, error: '密钥长度超限' });
      }
      if (hasControlChars(openaiKey) || hasControlChars(anthropicKey)) {
        return Promise.resolve({ success: false, error: '密钥包含非法控制字符' });
      }
      return ipcRenderer.invoke('proxy:setKeys', openaiKey, anthropicKey);
    }
  },

  config: {
    get: (key: string) => {
      if (!VALID_CONFIG_KEYS.includes(key as typeof VALID_CONFIG_KEYS[number])) {
        return Promise.resolve(undefined);
      }
      return ipcRenderer.invoke('config:get', key);
    },
    set: (key: string, value: string) => {
      if (!VALID_CONFIG_KEYS.includes(key as typeof VALID_CONFIG_KEYS[number])) {
        return Promise.resolve({ success: false, error: '无效的配置键' });
      }
      if (typeof value !== 'string' || value.length > 1000) {
        return Promise.resolve({ success: false, error: '配置值无效' });
      }
      return ipcRenderer.invoke('config:set', key, value);
    },
    getAll: () => ipcRenderer.invoke('config:getAll'),
    reset: () => ipcRenderer.invoke('config:reset')
  },

  apiKeys: {
    list: () => ipcRenderer.invoke('apiKeys:list'),
    add: (name: string, type: string, key: string) => {
      if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
        return Promise.resolve({ success: false, error: '名称无效' });
      }
      if (hasControlChars(name)) {
        return Promise.resolve({ success: false, error: '名称包含非法字符' });
      }
      if (!VALID_KEY_TYPES.includes(type as typeof VALID_KEY_TYPES[number])) {
        return Promise.resolve({ success: false, error: '不支持的密钥类型' });
      }
      if (!key || typeof key !== 'string' || key.length < 10 || key.length > 500) {
        return Promise.resolve({ success: false, error: '密钥格式无效' });
      }
      if (hasControlChars(key)) {
        return Promise.resolve({ success: false, error: '密钥包含非法控制字符' });
      }
      return ipcRenderer.invoke('apiKeys:add', name, type, key);
    },
    delete: (id: number) => {
      if (typeof id !== 'number' || id < 1) {
        return Promise.resolve({ success: false, error: '无效的 ID' });
      }
      return ipcRenderer.invoke('apiKeys:delete', id);
    },
    get: (id: number) => {
      if (typeof id !== 'number' || id < 1) return Promise.resolve(null);
      return ipcRenderer.invoke('apiKeys:get', id);
    }
  },

  history: {
    list: (options?: { limit?: number; offset?: number; apiType?: string; search?: string }) => {
      if (options) {
        if (options.limit !== undefined && (options.limit < 1 || options.limit > 1000)) {
          return Promise.resolve([]);
        }
        if (options.offset !== undefined && (options.offset < 0)) {
          return Promise.resolve([]);
        }
        if (options.search !== undefined && (typeof options.search !== 'string' || options.search.length > 200)) {
          return Promise.resolve([]);
        }
        if (options.apiType !== undefined && !['openai', 'anthropic'].includes(options.apiType)) {
          return Promise.resolve([]);
        }
      }
      return ipcRenderer.invoke('history:list', options);
    },
    clear: () => ipcRenderer.invoke('history:clear')
  },

  budget: {
    get: () => ipcRenderer.invoke('budget:get'),
    set: (type: string, limit: number) => {
      if (!VALID_BUDGET_TYPES.includes(type as typeof VALID_BUDGET_TYPES[number])) {
        return Promise.resolve({ success: false, error: '无效的预算类型' });
      }
      if (typeof limit !== 'number' || limit < 0 || limit > 1000000) {
        return Promise.resolve({ success: false, error: '预算限额无效' });
      }
      return ipcRenderer.invoke('budget:set', type, limit);
    },
    status: () => ipcRenderer.invoke('budget:status'),
    resetSpent: (type: string) => {
      if (!VALID_BUDGET_TYPES.includes(type as typeof VALID_BUDGET_TYPES[number])) {
        return Promise.resolve({ success: false, error: '无效的预算类型' });
      }
      return ipcRenderer.invoke('budget:resetSpent', type);
    }
  },

  stats: {
    summary: () => ipcRenderer.invoke('stats:summary'),
    reset: () => ipcRenderer.invoke('stats:reset')
  },

  optimization: {
    getConfig: () => ipcRenderer.invoke('optimization:getConfig'),
    setConfig: (config: Record<string, unknown>) => {
      if (!config || typeof config !== 'object') {
        return Promise.resolve({ success: false, error: '配置无效' });
      }
      // 属性白名单校验：只允许已知的优化开关
      for (const key of Object.keys(config)) {
        if (!VALID_OPTIM_KEYS.includes(key as typeof VALID_OPTIM_KEYS[number])) {
          return Promise.resolve({ success: false, error: `未知的优化配置项: ${key}` });
        }
        if (typeof config[key] !== 'boolean') {
          return Promise.resolve({ success: false, error: `配置项 ${key} 必须为布尔值` });
        }
      }
      return ipcRenderer.invoke('optimization:setConfig', config);
    }
  },

  rules: {
    list: () => ipcRenderer.invoke('rules:list'),
    add: (rule: { name: string; type: string; pattern: string; replacement: string; enabled: boolean; priority: number }) => {
      if (!rule || typeof rule !== 'object') {
        return Promise.resolve({ success: false, error: '规则数据无效' });
      }
      if (!rule.name || typeof rule.name !== 'string' || rule.name.length > 100) {
        return Promise.resolve({ success: false, error: '规则名称无效' });
      }
      if (!['replace', 'filter', 'route'].includes(rule.type)) {
        return Promise.resolve({ success: false, error: '不支持的规则类型' });
      }
      if (typeof rule.pattern !== 'string' || rule.pattern.length > 500) {
        return Promise.resolve({ success: false, error: '正则表达式过长' });
      }
      return ipcRenderer.invoke('rules:add', rule);
    },
    update: (id: number, updates: Record<string, unknown>) => {
      if (typeof id !== 'number' || id < 1) {
        return Promise.resolve({ success: false, error: '无效的规则 ID' });
      }
      return ipcRenderer.invoke('rules:update', id, updates);
    },
    delete: (id: number) => {
      if (typeof id !== 'number' || id < 1) {
        return Promise.resolve({ success: false, error: '无效的规则 ID' });
      }
      return ipcRenderer.invoke('rules:delete', id);
    },
    validate: (pattern: string) => {
      if (typeof pattern !== 'string') {
        return Promise.resolve({ error: '正则表达式必须为字符串' });
      }
      return ipcRenderer.invoke('rules:validate', pattern);
    }
  },

  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_CHANNELS.includes(channel as typeof ALLOWED_CHANNELS[number])) {
      console.warn(`IPC 通道 "${channel}" 不在白名单中，拒绝监听`);
      return;
    }
    const listener = (_: unknown, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, listener);
  },

  off: (channel: string) => {
    if (!ALLOWED_CHANNELS.includes(channel as typeof ALLOWED_CHANNELS[number])) {
      return;
    }
    ipcRenderer.removeAllListeners(channel);
  }
});