import { loadJson, saveJsonAsync } from '../utils/storage';
import { getMutex } from '../utils/mutex';

interface ConfigStore {
  config: Record<string, string>;
  optimization: {
    caching: boolean;
    compression: boolean;
    routing: boolean;
    batching: boolean;
    rules: boolean;
  };
}

const STORAGE_FILE = 'config.json';
const mutex = getMutex(STORAGE_FILE);

/** 允许的配置键白名单 */
const VALID_CONFIG_KEYS = new Set(['proxyPort', 'dataRetentionDays', 'cacheTTL', 'theme']);

/** 配置值验证规则 */
const CONFIG_VALIDATORS: Record<string, (val: string) => boolean> = {
  proxyPort: (v) => {
    if (!/^\d+$/.test(v)) return false;
    const n = parseInt(v, 10);
    return n >= 1024 && n <= 65535;
  },
  dataRetentionDays: (v) => {
    if (!/^\d+$/.test(v)) return false;
    const n = parseInt(v, 10);
    return n >= 1 && n <= 365;
  },
  cacheTTL: (v) => ['5min', '1hour'].includes(v),
  theme: (v) => ['light', 'dark', 'auto'].includes(v)
};

/** 优化配置允许的键白名单 */
const VALID_OPTIM_KEYS = new Set(['caching', 'compression', 'routing', 'batching', 'rules']);

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
    batching: false,
    rules: true
  }
};

function getStore(): ConfigStore {
  return loadJson<ConfigStore>(STORAGE_FILE, structuredClone(DEFAULT_CONFIG));
}

async function saveStore(store: ConfigStore): Promise<void> {
  await saveJsonAsync(STORAGE_FILE, store);
}

export async function getConfig(key: string): Promise<string | undefined> {
  return mutex.runExclusive(() => {
    const store = getStore();
    return store.config[key];
  });
}

export async function setConfig(key: string, value: string): Promise<void> {
  if (!VALID_CONFIG_KEYS.has(key)) {
    throw new Error(`未知的配置项: ${key}`);
  }
  const validator = CONFIG_VALIDATORS[key];
  if (validator && !validator(value)) {
    throw new Error(`配置值无效: ${key}=${value}`);
  }
  return mutex.runExclusive(async () => {
    const store = getStore();
    store.config[key] = value;
    await saveStore(store);
  });
}

export async function getAllConfig(): Promise<Record<string, string>> {
  return mutex.runExclusive(() => {
    const store = getStore();
    return { ...store.config };
  });
}

export async function resetConfig(): Promise<void> {
  return mutex.runExclusive(async () => {
    await saveStore(structuredClone(DEFAULT_CONFIG));
  });
}

export async function getOptimizationConfig(): Promise<Record<string, boolean>> {
  return mutex.runExclusive(() => {
    const store = getStore();
    return { ...store.optimization };
  });
}

export async function setOptimizationConfig(config: Record<string, boolean>): Promise<void> {
  // 白名单校验：拒绝未知的优化键
  for (const key of Object.keys(config)) {
    if (!VALID_OPTIM_KEYS.has(key)) {
      throw new Error(`未知的优化配置项: ${key}`);
    }
    if (typeof config[key] !== 'boolean') {
      throw new Error(`配置项 ${key} 必须为布尔值`);
    }
  }
  return mutex.runExclusive(async () => {
    const store = getStore();
    Object.assign(store.optimization, config);
    await saveStore(store);
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
