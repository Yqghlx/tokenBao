import { loadJson, saveJsonAsync } from '../utils/storage';
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
const MAX_BODY_SIZE = 50000; // requestBody/responseBody 最大 50KB
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
    cachedRetentionDays = (Number.isNaN(days) || days < 1) ? DEFAULT_RETENTION_DAYS : days;
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
  store.requests = store.requests.filter(r => {
    // new Date().getTime() 对无效输入返回 NaN 而非抛异常，无需 try-catch
    const ts = new Date(r.timestamp).getTime();
    // 无效 timestamp（NaN）视为损坏数据，清理掉
    if (Number.isNaN(ts)) {
      console.warn(`历史记录 ID=${r.id} 时间戳无效，已清理: "${r.timestamp}"`);
      return false;
    }
    return ts >= cutoff;
  });

  if (store.requests.length < before) {
    console.info(`历史记录清理: 删除 ${before - store.requests.length} 条过期记录（保留 ${retentionDays} 天）`);
  }
}

async function saveStore(store: HistoryStore): Promise<void> {
  if (store.requests.length > MAX_HISTORY) {
    store.requests = store.requests.slice(-MAX_HISTORY);
  }
  await saveJsonAsync(STORAGE_FILE, store);
}

export async function addRequest(log: Omit<RequestLog, 'id'>): Promise<RequestLog> {
  // 输入校验：拒绝无效数据
  if (!log.timestamp || typeof log.timestamp !== 'string' || log.timestamp.length > 50) {
    throw new Error('timestamp 无效');
  }
  if (!log.apiType || typeof log.apiType !== 'string' || log.apiType.length > 50) {
    throw new Error('apiType 无效');
  }
  if (!log.model || typeof log.model !== 'string' || log.model.length > 100) {
    throw new Error('model 无效');
  }
  if (typeof log.inputTokens !== 'number' || Number.isNaN(log.inputTokens) || log.inputTokens < 0) {
    throw new Error('inputTokens 无效');
  }
  if (typeof log.outputTokens !== 'number' || Number.isNaN(log.outputTokens) || log.outputTokens < 0) {
    throw new Error('outputTokens 无效');
  }
  if (typeof log.cost !== 'number' || Number.isNaN(log.cost) || log.cost < 0) {
    throw new Error('cost 无效');
  }
  if (typeof log.cachedTokens !== 'number' || Number.isNaN(log.cachedTokens) || log.cachedTokens < 0) {
    throw new Error('cachedTokens 无效');
  }
  if (log.cached !== undefined && typeof log.cached !== 'boolean') {
    throw new Error('cached 必须为布尔值');
  }
  if (log.requestBody && log.requestBody.length > MAX_BODY_SIZE) {
    log = { ...log, requestBody: log.requestBody.slice(0, MAX_BODY_SIZE) + '...[truncated]' };
  }
  if (log.responseBody && log.responseBody.length > MAX_BODY_SIZE) {
    log = { ...log, responseBody: log.responseBody.slice(0, MAX_BODY_SIZE) + '...[truncated]' };
  }

  return mutex.runExclusive(async () => {
    const store = getStore();
    const request: RequestLog = { ...log, id: store.nextId++ };
    store.requests.push(request);
    // 在锁内同步清理过期记录，避免与后续写入冲突
    await cleanupExpiredRequests(store);
    await saveStore(store);
    return request;
  });
}

/** 共享过滤逻辑：apiType + search 关键词 */
function filterRequests(requests: RequestLog[], options?: { apiType?: string; search?: string }): RequestLog[] {
  let filtered = requests;
  if (options?.apiType) {
    filtered = filtered.filter(r => r.apiType === options.apiType);
  }
  if (options?.search) {
    // 防御性清理：去除空字节并截断过长搜索词，避免极端输入性能问题
    const keyword = options.search.replace(/\0/g, '').slice(0, 200).toLowerCase();
    if (keyword.length > 0) {
      filtered = filtered.filter(r =>
        r.model.toLowerCase().includes(keyword) ||
        r.apiType.toLowerCase().includes(keyword)
      );
    }
  }
  return filtered;
}

export async function listRequests(options?: { limit?: number; offset?: number; apiType?: string; search?: string }): Promise<RequestLog[]> {
  return mutex.runExclusive(() => {
    const store = getStore();
    // 倒序构建：从末尾向前遍历，避免完整数组反转复制
    const reversed: RequestLog[] = [];
    for (let i = store.requests.length - 1; i >= 0; i--) {
      reversed.push(store.requests[i]);
    }
    let filtered = filterRequests(reversed, options);

    if (options?.offset) {
      filtered = filtered.slice(options.offset);
    }
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  });
}

export async function clearRequests(): Promise<void> {
  return mutex.runExclusive(async () => {
    await saveStore({ requests: [], nextId: 1 });
  });
}

/** 获取过滤后的记录总数（用于分页计算） */
export async function getRequestCount(options?: { apiType?: string; search?: string }): Promise<number> {
  return mutex.runExclusive(() => {
    return filterRequests(getStore().requests, options).length;
  });
}

export default {
  addRequest,
  listRequests,
  clearRequests,
  getRequestCount
};
