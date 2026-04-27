import { loadJson, saveJson } from '../utils/storage';
import { getConfig } from './config';
import { getMutex } from '../utils/mutex';

export interface RequestLog {
  id: number;
  apiType: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number;
  cached: boolean;
  timestamp: string;
  requestBody?: string;
  responseBody?: string;
}

interface HistoryStore {
  requests: RequestLog[];
  nextId: number;
}

const STORAGE_FILE = 'history.json';
const MAX_HISTORY = 1000;
const DEFAULT_RETENTION_DAYS = 30;
const mutex = getMutex(STORAGE_FILE);

/** 缓存的保留天数，避免每次清理都读配置文件 */
let cachedRetentionDays = DEFAULT_RETENTION_DAYS;
let retentionCacheTime = 0;
const RETENTION_CACHE_TTL = 60000; // 缓存 60 秒

function getStore(): HistoryStore {
  return loadJson<HistoryStore>(STORAGE_FILE, { requests: [], nextId: 1 });
}

/**
 * 获取保留天数（带缓存，最多每分钟读一次配置）
 */
async function getRetentionDays(): Promise<number> {
  const now = Date.now();
  if (now - retentionCacheTime < RETENTION_CACHE_TTL) {
    return cachedRetentionDays;
  }
  try {
    const daysStr = await getConfig('dataRetentionDays');
    const days = daysStr ? parseInt(daysStr, 10) : DEFAULT_RETENTION_DAYS;
    cachedRetentionDays = (isNaN(days) || days < 1) ? DEFAULT_RETENTION_DAYS : days;
  } catch {
    cachedRetentionDays = DEFAULT_RETENTION_DAYS;
  }
  retentionCacheTime = now;
  return cachedRetentionDays;
}

/**
 * 根据配置的数据保留天数清理过期记录
 */
async function cleanupExpiredRequests(store: HistoryStore): Promise<void> {
  const retentionDays = await getRetentionDays();

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const before = store.requests.length;
  store.requests = store.requests.filter(r => new Date(r.timestamp).getTime() >= cutoff);

  if (store.requests.length < before) {
    console.log(`历史记录清理: 删除 ${before - store.requests.length} 条过期记录（保留 ${retentionDays} 天）`);
  }
}

function saveStore(store: HistoryStore): void {
  if (store.requests.length > MAX_HISTORY) {
    store.requests = store.requests.slice(-MAX_HISTORY);
  }
  saveJson(STORAGE_FILE, store);
}

export async function addRequest(log: Omit<RequestLog, 'id'>): Promise<RequestLog> {
  return mutex.runExclusive(async () => {
    const store = getStore();
    const request: RequestLog = { ...log, id: store.nextId++ };
    store.requests.push(request);
    // 在锁内同步清理过期记录，避免与后续写入冲突
    await cleanupExpiredRequests(store);
    saveStore(store);
    return request;
  });
}

export async function listRequests(options?: { limit?: number; offset?: number; apiType?: string; search?: string }): Promise<RequestLog[]> {
  const store = getStore();
  // 最新请求在前
  let filtered = [...store.requests].reverse();

  if (options?.apiType) {
    filtered = filtered.filter(r => r.apiType === options.apiType);
  }

  if (options?.search) {
    const keyword = options.search.toLowerCase();
    filtered = filtered.filter(r =>
      r.model.toLowerCase().includes(keyword) ||
      r.apiType.toLowerCase().includes(keyword)
    );
  }

  if (options?.offset) {
    filtered = filtered.slice(options.offset);
  }

  if (options?.limit) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

export async function getRequest(id: number): Promise<RequestLog | undefined> {
  const store = getStore();
  return store.requests.find(r => r.id === id);
}

export async function clearRequests(): Promise<void> {
  return mutex.runExclusive(() => {
    saveStore({ requests: [], nextId: 1 });
  });
}

export async function getRecentRequests(limit = 10): Promise<RequestLog[]> {
  const store = getStore();
  return store.requests.slice(-limit);
}

export default {
  addRequest,
  listRequests,
  getRequest,
  clearRequests,
  getRecentRequests
};
