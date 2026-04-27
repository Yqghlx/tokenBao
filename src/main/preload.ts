import { contextBridge, ipcRenderer } from 'electron';

/** 允许渲染进程监听的安全通道白名单 */
const ALLOWED_CHANNELS = [
  'proxy:statusChanged',
  'proxy:error',
  'stats:updated',
] as const;

contextBridge.exposeInMainWorld('electronAPI', {
  proxy: {
    start: (port: number) => ipcRenderer.invoke('proxy:start', port),
    stop: () => ipcRenderer.invoke('proxy:stop'),
    status: () => ipcRenderer.invoke('proxy:status'),
    setKeys: (openaiKey: string, anthropicKey: string) =>
      ipcRenderer.invoke('proxy:setKeys', openaiKey, anthropicKey)
  },

  config: {
    get: (key: string) => ipcRenderer.invoke('config:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('config:set', key, value),
    getAll: () => ipcRenderer.invoke('config:getAll')
  },

  apiKeys: {
    list: () => ipcRenderer.invoke('apiKeys:list'),
    add: (name: string, type: string, key: string) =>
      ipcRenderer.invoke('apiKeys:add', name, type, key),
    delete: (id: number) => ipcRenderer.invoke('apiKeys:delete', id),
    get: (id: number) => ipcRenderer.invoke('apiKeys:get', id)
  },

  history: {
    list: (options?: { limit?: number; offset?: number; apiType?: string }) =>
      ipcRenderer.invoke('history:list', options),
    clear: () => ipcRenderer.invoke('history:clear')
  },

  budget: {
    get: () => ipcRenderer.invoke('budget:get'),
    set: (type: string, limit: number) => ipcRenderer.invoke('budget:set', type, limit),
    status: () => ipcRenderer.invoke('budget:status')
  },

  stats: {
    summary: () => ipcRenderer.invoke('stats:summary')
  },

  optimization: {
    getConfig: () => ipcRenderer.invoke('optimization:getConfig'),
    setConfig: (config: Record<string, unknown>) =>
      ipcRenderer.invoke('optimization:setConfig', config)
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