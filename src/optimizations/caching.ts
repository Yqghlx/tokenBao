import { loadJson, saveJson } from '../utils/storage';

interface CachingOptions {
  enabled: boolean;
  ttl: '5min' | '1hour';
  scope: 'system' | 'history' | 'both';
}

interface CacheStore {
  patterns: Array<{ key: string; content: string; timestamp: number }>;
}

const STORAGE_FILE = 'cache.json';
const MAX_CACHE_SIZE = 1000; // 最大缓存条目数

const defaultOptions: CachingOptions = {
  enabled: true,
  ttl: '5min',
  scope: 'both'
};

const cachePatterns: Map<string, { content: string; timestamp: number }> = new Map();
// 用 Set 维护 LRU 顺序：插入序即访问序，delete+add 实现 O(1) 移动
const cacheOrder: Set<string> = new Set();
// 缓存命中/未命中计数器，用于可观测性
let hits = 0;
let misses = 0;

function loadFromStorage(): void {
  try {
    const store = loadJson<CacheStore>(STORAGE_FILE, { patterns: [] });
    const now = Date.now();
    const ttlMs = defaultOptions.ttl === '5min' ? 5 * 60 * 1000 : 60 * 60 * 1000;

    store.patterns.forEach(p => {
      if (now - p.timestamp < ttlMs) {
        cachePatterns.set(p.key, { content: p.content, timestamp: p.timestamp });
        cacheOrder.add(p.key);
      }
    });

    // 加载时截断超限缓存
    evictIfNeeded();
  } catch (err) {
    // 首次加载时文件不存在是正常的，其他错误需要记录
    const filePath = STORAGE_FILE;
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`加载缓存数据失败 (${filePath}):`, (err as Error).message);
    }
  }
}

/** 淘汰最早的条目直到缓存大小合规（O(1) 每次淘汰） */
function evictIfNeeded(): void {
  while (cachePatterns.size > MAX_CACHE_SIZE && cacheOrder.size > 0) {
    const oldest = cacheOrder.values().next().value;
    if (oldest === undefined) break;
    cacheOrder.delete(oldest);
    cachePatterns.delete(oldest);
  }
}

function saveToStorage(): boolean {
  try {
    const patterns = Array.from(cachePatterns.entries()).map(([key, value]) => ({
      key, content: value.content, timestamp: value.timestamp
    }));
    saveJson(STORAGE_FILE, { patterns });
    return true;
  } catch (err) {
    console.warn('缓存数据写入失败:', (err as Error).message);
    return false;
  }
}

/** 防抖写入：标记脏数据，延迟 500ms 后一次性写入 */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let isDirty = false;

function scheduleSave(): void {
  isDirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (isDirty) {
      // 写入成功后再清除脏标记，失败时保留以便下次重试
      if (saveToStorage()) {
        isDirty = false;
      }
    }
  }, 500);
  // 不阻塞进程退出
  if (saveTimer && typeof saveTimer === 'object' && 'unref' in saveTimer) {
    saveTimer.unref();
  }
}

/** 进程退出时同步刷盘，防止 debounce 导致数据丢失 */
let flushCalled = false;
function flushSave(): void {
  // beforeExit 和 exit 可能都被触发，防止重复刷盘
  if (flushCalled) return;
  flushCalled = true;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (isDirty) {
    if (saveToStorage()) {
      isDirty = false;
    }
  }
}

process.on('beforeExit', flushSave);
// process.exit() 不触发 beforeExit，需额外监听 exit 事件；saveJson 全部使用同步 I/O，可在 exit 中安全调用
process.on('exit', flushSave);

loadFromStorage();

const MAX_CACHE_INPUT_SIZE = 1024 * 1024; // 缓存键输入最大 1MB，防止超长内容消耗 CPU

/**
 * FNV-1a 快速非加密哈希（64 位），用于缓存键生成
 * 比 SHA-256 快约 10 倍，碰撞率对缓存场景足够安全
 */
function fnv1a64(input: string): string {
  let hash1 = 0x811c9dc5 >>> 0;
  let hash2 = 0x1c9dc581 >>> 0;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    hash1 ^= c;
    hash1 = Math.imul(hash1, 0x01000193) >>> 0;
    hash2 ^= c;
    hash2 = Math.imul(hash2, 0x01000193) >>> 0;
  }
  return (hash1 >>> 0).toString(16).padStart(8, '0') + (hash2 >>> 0).toString(16).padStart(8, '0');
}

function getCacheKey(apiType: string, content: string): string {
  const input = content.length > MAX_CACHE_INPUT_SIZE ? content.slice(0, MAX_CACHE_INPUT_SIZE) : content;
  return `${apiType}:${fnv1a64(input)}`;
}

export function getOptions(): CachingOptions {
  return { ...defaultOptions };
}

export function setOptions(options: Partial<CachingOptions>): void {
  Object.assign(defaultOptions, options);
}

export function addCache(apiType: string, content: string): void {
  if (!defaultOptions.enabled) return;

  const key = getCacheKey(apiType, content);
  // 已存在则先移除再重新添加，实现 O(1) 的 LRU 移动
  if (cacheOrder.has(key)) cacheOrder.delete(key);

  cachePatterns.set(key, {
    content: content.slice(0, 1000),
    timestamp: Date.now()
  });
  // 内容被截断时记录日志，便于排查缓存命中率问题
  if (content.length > 1000) {
    console.warn(`caching: 内容超过 1000 字符被截断（原始 ${content.length} 字符），缓存键 ${key.slice(0, 20)}...`);
  }
  cacheOrder.add(key);
  evictIfNeeded();
  scheduleSave();
}

export function checkCache(apiType: string, content: string): boolean {
  if (!defaultOptions.enabled) return false;

  const key = getCacheKey(apiType, content);
  const cached = cachePatterns.get(key);

  if (!cached) { misses++; return false; }

  const ttlMs = defaultOptions.ttl === '5min' ? 5 * 60 * 1000 : 60 * 60 * 1000;
  if (Date.now() - cached.timestamp >= ttlMs) {
    misses++;
    // 过期条目即时清理，避免长期驻留内存
    cachePatterns.delete(key);
    cacheOrder.delete(key);
    scheduleSave();
    return false;
  }

  hits++;
  // 命中时更新 LRU 顺序：O(1) 移动到末尾
  if (cacheOrder.has(key)) {
    cacheOrder.delete(key);
    cacheOrder.add(key);
  }

  return true;
}

export function addCacheControl<T extends Record<string, unknown>>(content: T, scope?: string): T {
  if (!defaultOptions.enabled) return content;

  const targetScope = scope || defaultOptions.scope;

  if (targetScope === 'system' || targetScope === 'both') {
    if (content.system) {
      return {
        ...content,
        system: Array.isArray(content.system)
          ? content.system.map((block: Record<string, unknown>) => ({ ...block, cache: true }))
          : [{ type: 'text', text: content.system as string, cache: true }]
      };
    }
  }

  return content;
}

export function isEnabled(): boolean {
  return defaultOptions.enabled;
}

/** 获取缓存命中/未命中统计 */
export function getCacheMetrics(): { hits: number; misses: number; size: number; hitRate: number } {
  const total = hits + misses;
  return {
    hits,
    misses,
    size: cachePatterns.size,
    hitRate: total > 0 ? Math.round((hits / total) * 100) : 0
  };
}

export default {
  getOptions,
  setOptions,
  addCache,
  checkCache,
  addCacheControl,
  isEnabled,
  getCacheMetrics
};