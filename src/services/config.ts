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
    dlp: boolean;
  };
}

const STORAGE_FILE = 'config.json';
const mutex = getMutex(STORAGE_FILE);

/** 允许的配置键白名单 */
const VALID_CONFIG_KEYS = new Set(['proxyPort', 'dataRetentionDays', 'cacheTTL', 'theme']);

/** 预编译验证正则，避免每次校验时重新编译 */
const REGEX_DIGITS = /^\d+$/;
const VALID_CACHE_TTL = new Set(['5min', '1hour']);
const VALID_THEMES = new Set(['light', 'dark', 'auto']);

/** 配置值验证规则 */
const CONFIG_VALIDATORS: Record<string, (val: string) => boolean> = {
  proxyPort: (v) => {
    if (!REGEX_DIGITS.test(v) || v.length > 5) return false;
    const n = parseInt(v, 10);
    return n >= 1024 && n <= 65535;
  },
  dataRetentionDays: (v) => {
    if (!REGEX_DIGITS.test(v) || v.length > 3) return false;
    const n = parseInt(v, 10);
    return n >= 1 && n <= 365;
  },
  cacheTTL: (v) => VALID_CACHE_TTL.has(v),
  theme: (v) => VALID_THEMES.has(v)
};

/** 优化配置允许的键白名单 */
const VALID_OPTIM_KEYS = new Set(['caching', 'compression', 'routing', 'batching', 'rules', 'dlp']);

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
    rules: true,
    dlp: false
  }
};

/** 内存缓存：避免每次请求都执行文件 I/O 和 JSON 解析 */
let cachedStore: ConfigStore | null = null;

function getStore(): ConfigStore {
  if (cachedStore) return cachedStore;
  const store = loadJson<ConfigStore>(STORAGE_FILE, structuredClone(DEFAULT_CONFIG));
  // 剥离不在白名单中的多余配置键，防止历史遗留或手动编辑引入的无效项
  for (const key of Object.keys(store.config)) {
    if (!VALID_CONFIG_KEYS.has(key)) {
      delete store.config[key];
    }
  }
  cachedStore = store;
  return store;
}

async function saveStore(store: ConfigStore): Promise<void> {
  await saveJsonAsync(STORAGE_FILE, store);
  // 写入成功后更新缓存，后续读取直接命中内存
  cachedStore = store;
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
    // 重置时清除旧缓存，写入新默认值后 saveStore 会更新缓存
    cachedStore = null;
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

/** 测试辅助：重置内存缓存（仅用于测试隔离） */
export function _resetCache(): void {
  cachedStore = null;
}

export default {
  getConfig,
  setConfig,
  getAllConfig,
  resetConfig,
  getOptimizationConfig,
  setOptimizationConfig
};
