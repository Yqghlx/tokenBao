import { loadJson, saveJsonAsync } from '../utils/storage';
import { getMutex } from '../utils/mutex';

interface BudgetEntry {
  type: string;
  limit: number;
  spent: number;
  lastResetDate: string;
}

interface BudgetStore {
  daily: BudgetEntry;
  monthly: BudgetEntry;
}

const STORAGE_FILE = 'budget.json';
const mutex = getMutex(STORAGE_FILE);

/** 日期字符串缓存，避免每次请求创建 Date 对象和字符串拼接 */
let cachedDateStr: { today: string; month: string; ts: number } | null = null;
const DATE_CACHE_TTL = 60000; // 1 分钟内复用

/** 默认预算配置（单一来源） */
function getDefaultBudget(): BudgetStore {
  return {
    daily: { type: 'daily', limit: 10, spent: 0, lastResetDate: getTodayStr() },
    monthly: { type: 'monthly', limit: 100, spent: 0, lastResetDate: getMonthStr() }
  };
}

/** 获取今天的日期字符串（YYYY-MM-DD），带分钟级缓存 */
function getTodayStr(): string {
  const now = Date.now();
  if (cachedDateStr && now - cachedDateStr.ts < DATE_CACHE_TTL) {
    return cachedDateStr.today;
  }
  const date = new Date();
  const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  cachedDateStr = {
    today,
    month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
    ts: now
  };
  return today;
}

/** 获取本月的标识字符串（YYYY-MM），带分钟级缓存 */
function getMonthStr(): string {
  const now = Date.now();
  if (cachedDateStr && now - cachedDateStr.ts < DATE_CACHE_TTL) {
    return cachedDateStr.month;
  }
  const date = new Date();
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  cachedDateStr = {
    today: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    month,
    ts: now
  };
  return month;
}

function getStore(): BudgetStore {
  // 深拷贝默认值，避免 loadJson 返回引用导致默认值被修改
  return loadJson<BudgetStore>(STORAGE_FILE, structuredClone(getDefaultBudget()));
}

async function saveStore(store: BudgetStore): Promise<void> {
  await saveJsonAsync(STORAGE_FILE, store);
}

/**
 * 检查并执行自动重置：日预算按天重置，月预算按月重置
 * 返回是否有实际重置操作，调用方可据此决定是否 saveStore
 */
function checkAutoReset(store: BudgetStore): boolean {
  const today = getTodayStr();
  const month = getMonthStr();
  let changed = false;

  if (store.daily.lastResetDate !== today) {
    store.daily.spent = 0;
    store.daily.lastResetDate = today;
    changed = true;
  }

  if (store.monthly.lastResetDate !== month) {
    store.monthly.spent = 0;
    store.monthly.lastResetDate = month;
    changed = true;
  }

  return changed;
}

export async function getBudget(type: 'daily' | 'monthly'): Promise<{ type: string; limit: number; spent: number }> {
  return mutex.runExclusive(async () => {
    const store = getStore();
    if (checkAutoReset(store)) await saveStore(store);
    return { ...store[type] };
  });
}

export async function setBudgetLimit(type: 'daily' | 'monthly', limit: number): Promise<{ type: string; limit: number; spent: number }> {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    throw new Error('预算限额必须为正数');
  }
  return mutex.runExclusive(async () => {
    const store = getStore();
    checkAutoReset(store);
    store[type].limit = limit;
    await saveStore(store);
    return { ...store[type] };
  });
}

export async function updateSpent(type: 'daily' | 'monthly', amount: number): Promise<void> {
  return mutex.runExclusive(async () => {
    if (!Number.isFinite(amount)) {
      console.warn(`budget.updateSpent: 无效金额 (${amount})，已跳过`);
      return;
    }
    if (amount < 0) return;
    const store = getStore();
    checkAutoReset(store);
    // 防止磁盘损坏数据（NaN/Infinity）污染累加结果
    const currentSpent = Number.isFinite(store[type].spent) ? store[type].spent : 0;
    const newSpent = currentSpent + amount;
    // 防止溢出
    store[type].spent = newSpent > Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : newSpent;
    await saveStore(store);
  });
}

export async function resetSpent(type: 'daily' | 'monthly'): Promise<void> {
  return mutex.runExclusive(async () => {
    const store = getStore();
    store[type].spent = 0;
    if (type === 'daily') {
      store[type].lastResetDate = getTodayStr();
    } else {
      store[type].lastResetDate = getMonthStr();
    }
    await saveStore(store);
  });
}

export async function getBudgetStatus(): Promise<{
  daily: { limit: number; spent: number; remaining: number; percentage: number };
  monthly: { limit: number; spent: number; remaining: number; percentage: number };
}> {
  return mutex.runExclusive(async () => {
    const store = getStore();
    if (checkAutoReset(store)) await saveStore(store);

    const computeStatus = (b: BudgetEntry) => {
      // 防止持久化数据被污染时产生 NaN/Infinity/null
      const spent = Number.isFinite(b.spent) ? b.spent : 0;
      const limit = Number.isFinite(b.limit) ? b.limit : 0;
      return {
        limit,
        spent,
        remaining: Math.max(0, limit - spent),
        percentage: limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0
      };
    };
    return {
      daily: computeStatus(store.daily),
      monthly: computeStatus(store.monthly)
    };
  });
}

export default {
  getBudget,
  setBudgetLimit,
  updateSpent,
  resetSpent,
  getBudgetStatus
};
