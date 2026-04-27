import { loadJson, saveJson } from '../utils/storage';
import { getMutex } from '../utils/mutex';

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
const mutex = getMutex(STORAGE_FILE);

/** 配置值验证规则 */
const CONFIG_VALIDATORS: Record<string, (val: string) => boolean> = {
  proxyPort: (v) => {
    const n = parseInt(v, 10);
    return !isNaN(n) && n >= 1024 && n <= 65535;
  },
  dataRetentionDays: (v) => {
    const n = parseInt(v, 10);
    return !isNaN(n) && n >= 1 && n <= 365;
  },
  cacheTTL: (v) => ['5min', '1hour'].includes(v),
  theme: (v) => ['light', 'dark', 'auto'].includes(v)
};

/** 默认配置（单一来源，消除 DRY 违规） */
const DEFAULT_CONFIG: ConfigStore = {
  config: {
    proxyPort: '3000',
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
};

function getStore(): ConfigStore {
  // 深拷贝默认值，避免 loadJson 返回引用导致 DEFAULT_CONFIG 被外部修改
  return loadJson<ConfigStore>(STORAGE_FILE, JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
}

function saveStore(store: ConfigStore): void {
  saveJson(STORAGE_FILE, store);
}

export async function getConfig(key: string): Promise<string | undefined> {
  const store = getStore();
  return store.config[key];
}

export async function setConfig(key: string, value: string): Promise<void> {
  const validator = CONFIG_VALIDATORS[key];
  if (validator && !validator(value)) {
    throw new Error(`配置值无效: ${key}=${value}`);
  }
  return mutex.runExclusive(() => {
    const store = getStore();
    store.config[key] = value;
    saveStore(store);
  });
}

export async function getAllConfig(): Promise<Record<string, string>> {
  const store = getStore();
  return { ...store.config };
}

export async function resetConfig(): Promise<void> {
  return mutex.runExclusive(() => {
    // 使用深拷贝避免默认值被修改
    saveStore(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
  });
}

export async function getOptimizationConfig(): Promise<Record<string, boolean>> {
  const store = getStore();
  return { ...store.optimization };
}

export async function setOptimizationConfig(config: Record<string, boolean>): Promise<void> {
  return mutex.runExclusive(() => {
    const store = getStore();
    Object.assign(store.optimization, config);
    saveStore(store);
  });
}

export default {
  getConfig,
  setConfig,
  getAllConfig,
  resetConfig,
  getOptimizationConfig,
  setOptimizationConfig
};
