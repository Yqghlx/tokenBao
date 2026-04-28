import crypto from 'crypto';
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
// 记录插入顺序用于 LRU 淘汰
const cacheOrder: string[] = [];

function loadFromStorage(): void {
  try {
    const store = loadJson<CacheStore>(STORAGE_FILE, { patterns: [] });
    const now = Date.now();
    const ttlMs = defaultOptions.ttl === '5min' ? 5 * 60 * 1000 : 60 * 60 * 1000;

    store.patterns.forEach(p => {
      if (now - p.timestamp < ttlMs) {
        cachePatterns.set(p.key, { content: p.content, timestamp: p.timestamp });
        cacheOrder.push(p.key);
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

/** 淘汰最早的条目直到缓存大小合规 */
function evictIfNeeded(): void {
  while (cachePatterns.size > MAX_CACHE_SIZE && cacheOrder.length > 0) {
    // while 条件保证 length > 0，shift 必有返回值
    const oldest = cacheOrder.shift()!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    cachePatterns.delete(oldest);
  }
}

function saveToStorage(): void {
  try {
    const patterns = Array.from(cachePatterns.entries()).map(([key, value]) => ({
      key, content: value.content, timestamp: value.timestamp
    }));
    saveJson(STORAGE_FILE, { patterns });
  } catch (err) {
    console.warn('缓存数据写入失败:', (err as Error).message);
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
      isDirty = false;
      saveToStorage();
    }
  }, 500);
  // 不阻塞进程退出
  if (saveTimer && typeof saveTimer === 'object' && 'unref' in saveTimer) {
    saveTimer.unref();
  }
}

/** 进程退出时同步刷盘，防止 debounce 导致数据丢失 */
function flushSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (isDirty) {
    isDirty = false;
    saveToStorage();
  }
}

process.on('beforeExit', flushSave);
// process.exit() 不触发 beforeExit，需额外监听 exit 事件；saveJson 全部使用同步 I/O，可在 exit 中安全调用
process.on('exit', flushSave);

loadFromStorage();

function getCacheKey(apiType: string, content: string): string {
  // 使用 SHA-256 哈希避免前缀碰撞
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return `${apiType}:${hash}`;
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
  // 已存在则先从顺序中移除（会重新追加到末尾）
  const existingIdx = cacheOrder.indexOf(key);
  if (existingIdx !== -1) cacheOrder.splice(existingIdx, 1);

  cachePatterns.set(key, {
    content: content.slice(0, 1000),
    timestamp: Date.now()
  });
  // 内容被截断时记录日志，便于排查缓存命中率问题
  if (content.length > 1000) {
    console.warn(`caching: 内容超过 1000 字符被截断（原始 ${content.length} 字符），缓存键 ${key.slice(0, 20)}...`);
  }
  cacheOrder.push(key);
  evictIfNeeded();
  scheduleSave();
}

export function checkCache(apiType: string, content: string): boolean {
  if (!defaultOptions.enabled) return false;

  const key = getCacheKey(apiType, content);
  const cached = cachePatterns.get(key);

  if (!cached) return false;

  const ttlMs = defaultOptions.ttl === '5min' ? 5 * 60 * 1000 : 60 * 60 * 1000;
  if (Date.now() - cached.timestamp >= ttlMs) return false;

  // 命中时更新 LRU 顺序，防止频繁访问的条目被误淘汰
  const idx = cacheOrder.indexOf(key);
  if (idx !== -1) {
    cacheOrder.splice(idx, 1);
    cacheOrder.push(key);
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

export default {
  getOptions,
  setOptions,
  addCache,
  checkCache,
  addCacheControl,
  isEnabled
};