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
  const store = getStore();
  store[type].spent += amount;
  saveStore(store);
}

export async function resetSpent(type: 'daily' | 'monthly'): Promise<void> {
  const store = getStore();
  store[type].spent = 0;
  saveStore(store);
}

export async function getBudgetStatus(): Promise<{ type: string; limit: number; spent: number; remaining: number; percentage: number }> {
  const store = getStore();
  const budget = store.monthly;
  const remaining = budget.limit - budget.spent;
  const percentage = Math.round((budget.spent / budget.limit) * 100);
  return {
    type: budget.type,
    limit: budget.limit,
    spent: budget.spent,
    remaining: Math.max(0, remaining),
    percentage: Math.min(100, percentage)
  };
}

export default {
  getBudget,
  setBudgetLimit,
  updateSpent,
  resetSpent,
  getBudgetStatus
};