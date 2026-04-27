import { loadJson, saveJson } from '../utils/storage';

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

/** 获取今天的日期字符串（YYYY-MM-DD） */
function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 获取本月的标识字符串（YYYY-MM） */
function getMonthStr(): string {
  return new Date().toISOString().slice(0, 7);
}

function getStore(): BudgetStore {
  return loadJson<BudgetStore>(STORAGE_FILE, {
    daily: { type: 'daily', limit: 10, spent: 0, lastResetDate: getTodayStr() },
    monthly: { type: 'monthly', limit: 100, spent: 0, lastResetDate: getMonthStr() }
  });
}

function saveStore(store: BudgetStore): void {
  saveJson(STORAGE_FILE, store);
}

/**
 * 检查并执行自动重置：日预算按天重置，月预算按月重置
 */
function checkAutoReset(store: BudgetStore): void {
  const today = getTodayStr();
  const month = getMonthStr();

  if (store.daily.lastResetDate !== today) {
    store.daily.spent = 0;
    store.daily.lastResetDate = today;
  }

  if (store.monthly.lastResetDate !== month) {
    store.monthly.spent = 0;
    store.monthly.lastResetDate = month;
  }
}

export async function getBudget(type: 'daily' | 'monthly'): Promise<{ type: string; limit: number; spent: number }> {
  const store = getStore();
  checkAutoReset(store);
  saveStore(store);
  return { ...store[type] };
}

export async function setBudgetLimit(type: 'daily' | 'monthly', limit: number): Promise<{ type: string; limit: number; spent: number }> {
  const store = getStore();
  checkAutoReset(store);
  store[type].limit = limit;
  saveStore(store);
  return { ...store[type] };
}

export async function updateSpent(type: 'daily' | 'monthly', amount: number): Promise<void> {
  if (amount < 0) return;
  const store = getStore();
  checkAutoReset(store);
  store[type].spent += amount;
  saveStore(store);
}

export async function resetSpent(type: 'daily' | 'monthly'): Promise<void> {
  const store = getStore();
  store[type].spent = 0;
  if (type === 'daily') {
    store[type].lastResetDate = getTodayStr();
  } else {
    store[type].lastResetDate = getMonthStr();
  }
  saveStore(store);
}

export async function getBudgetStatus(): Promise<{
  daily: { limit: number; spent: number; remaining: number; percentage: number };
  monthly: { limit: number; spent: number; remaining: number; percentage: number };
}> {
  const store = getStore();
  checkAutoReset(store);
  saveStore(store);

  const computeStatus = (b: BudgetEntry) => ({
    limit: b.limit,
    spent: b.spent,
    remaining: Math.max(0, b.limit - b.spent),
    percentage: Math.min(100, Math.round((b.spent / b.limit) * 100))
  });
  return {
    daily: computeStatus(store.daily),
    monthly: computeStatus(store.monthly)
  };
}

export default {
  getBudget,
  setBudgetLimit,
  updateSpent,
  resetSpent,
  getBudgetStatus
};