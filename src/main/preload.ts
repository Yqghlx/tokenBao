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
    getAll: () => ipcRenderer.invoke('config:getAll')
  },

  apiKeys: {
    list: () => ipcRenderer.invoke('apiKeys:list'),
    add: (name: string, type: string, key: string) => {
      if (!name || typeof name !== 'string' || name.length > 100) {
        return Promise.resolve({ success: false, error: '名称无效' });
      }
      if (!VALID_KEY_TYPES.includes(type as typeof VALID_KEY_TYPES[number])) {
        return Promise.resolve({ success: false, error: '不支持的密钥类型' });
      }
      if (!key || typeof key !== 'string' || key.length < 10 || key.length > 500) {
        return Promise.resolve({ success: false, error: '密钥格式无效' });
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
    status: () => ipcRenderer.invoke('budget:status')
  },

  stats: {
    summary: () => ipcRenderer.invoke('stats:summary')
  },

  optimization: {
    getConfig: () => ipcRenderer.invoke('optimization:getConfig'),
    setConfig: (config: Record<string, unknown>) => {
      if (!config || typeof config !== 'object') {
        return Promise.resolve({ success: false, error: '配置无效' });
      }
      return ipcRenderer.invoke('optimization:setConfig', config);
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