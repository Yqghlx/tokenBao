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

/** 默认预算配置（单一来源） */
function getDefaultBudget(): BudgetStore {
  return {
    daily: { type: 'daily', limit: 10, spent: 0, lastResetDate: getTodayStr() },
    monthly: { type: 'monthly', limit: 100, spent: 0, lastResetDate: getMonthStr() }
  };
}

/** 获取今天的日期字符串（YYYY-MM-DD），使用本地时区 */
function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 获取本月的标识字符串（YYYY-MM），使用本地时区 */
function getMonthStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
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
    const newSpent = store[type].spent + amount;
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
