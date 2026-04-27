import { loadJson, saveJson } from '../utils/storage';

interface BudgetStore {
  daily: { type: string; limit: number; spent: number };
  monthly: { type: string; limit: number; spent: number };
}

const STORAGE_FILE = 'budget.json';

function getStore(): BudgetStore {
  return loadJson<BudgetStore>(STORAGE_FILE, {
    daily: { type: 'daily', limit: 10, spent: 0 },
    monthly: { type: 'monthly', limit: 100, spent: 0 }
  });
}

function saveStore(store: BudgetStore): void {
  saveJson(STORAGE_FILE, store);
}

export async function getBudget(type: 'daily' | 'monthly'): Promise<{ type: string; limit: number; spent: number }> {
  const store = getStore();
  return { ...store[type] };
}

export async function setBudgetLimit(type: 'daily' | 'monthly', limit: number): Promise<{ type: string; limit: number; spent: number }> {
  const store = getStore();
  store[type].limit = limit;
  saveStore(store);
  return { ...store[type] };
}

export async function updateSpent(type: 'daily' | 'monthly', amount: number): Promise<void> {
  if (amount < 0) return; // 不允许负值
  const store = getStore();
  store[type].spent += amount;
  saveStore(store);
}

export async function resetSpent(type: 'daily' | 'monthly'): Promise<void> {
  const store = getStore();
  store[type].spent = 0;
  saveStore(store);
}

export async function getBudgetStatus(): Promise<{
  daily: { limit: number; spent: number; remaining: number; percentage: number };
  monthly: { limit: number; spent: number; remaining: number; percentage: number };
}> {
  const store = getStore();
  const computeStatus = (b: { type: string; limit: number; spent: number }) => ({
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