import { loadJson, saveJson } from '../utils/storage';

interface ConfigStore {
  config: Record<string, string>;
  optimization: {
    caching: boolean;
    compression: boolean;
    routing: boolean;
    batching: boolean;
  };
}

const STORAGE_FILE = 'config.json';

function getStore(): ConfigStore {
  return loadJson<ConfigStore>(STORAGE_FILE, {
    config: {
      proxyPort: '8080',
      dataRetentionDays: '30',
      cacheTTL: '5min',
      theme: 'dark'
    },
    optimization: {
      caching: true,
      compression: true,
      routing: true,
      batching: false
    }
  });
}

function saveStore(store: ConfigStore): void {
  saveJson(STORAGE_FILE, store);
}

export async function getConfig(key: string): Promise<string | undefined> {
  const store = getStore();
  return store.config[key];
}

export async function setConfig(key: string, value: string): Promise<void> {
  const store = getStore();
  store.config[key] = value;
  saveStore(store);
}

export async function getAllConfig(): Promise<Record<string, string>> {
  const store = getStore();
  return { ...store.config };
}

export async function resetConfig(): Promise<void> {
  saveStore({
    config: {
      proxyPort: '8080',
      dataRetentionDays: '30',
      cacheTTL: '5min',
      theme: 'dark'
    },
    optimization: {
      caching: true,
      compression: true,
      routing: true,
      batching: false
    }
  });
}

export async function getOptimizationConfig(): Promise<Record<string, boolean>> {
  const store = getStore();
  return { ...store.optimization };
}

export async function setOptimizationConfig(config: Record<string, boolean>): Promise<void> {
  const store = getStore();
  Object.assign(store.optimization, config);
  saveStore(store);
}

export default {
  getConfig,
  setConfig,
  getAllConfig,
  resetConfig,
  getOptimizationConfig,
  setOptimizationConfig
};