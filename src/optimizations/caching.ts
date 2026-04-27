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

const defaultOptions: CachingOptions = {
  enabled: true,
  ttl: '5min',
  scope: 'both'
};

const cachePatterns: Map<string, { content: string; timestamp: number }> = new Map();

function loadFromStorage(): void {
  try {
    const store = loadJson<CacheStore>(STORAGE_FILE, { patterns: [] });
    const now = Date.now();
    const ttlMs = defaultOptions.ttl === '5min' ? 5 * 60 * 1000 : 60 * 60 * 1000;
    
    store.patterns.forEach(p => {
      if (now - p.timestamp < ttlMs) {
        cachePatterns.set(p.key, { content: p.content, timestamp: p.timestamp });
      }
    });
  } catch (e) {
    // 首次加载可能失败
  }
}

function saveToStorage(): void {
  const patterns = Array.from(cachePatterns.entries()).map(([key, value]) => ({
    key, content: value.content, timestamp: value.timestamp
  }));
  saveJson(STORAGE_FILE, { patterns });
}

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
  cachePatterns.set(key, {
    content: content.slice(0, 1000),
    timestamp: Date.now()
  });
  saveToStorage();
}

export function checkCache(apiType: string, content: string): boolean {
  if (!defaultOptions.enabled) return false;
  
  const key = getCacheKey(apiType, content);
  const cached = cachePatterns.get(key);
  
  if (!cached) return false;
  
  const ttlMs = defaultOptions.ttl === '5min' ? 5 * 60 * 1000 : 60 * 60 * 1000;
  return Date.now() - cached.timestamp < ttlMs;
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