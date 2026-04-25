import { loadJson, saveJson } from '../utils/storage';

interface Stats {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalCost: number;
  byApi: Record<string, { requests: number; tokens: number; cost: number }>;
  byModel: Record<string, { requests: number; tokens: number; cost: number }>;
}

const STORAGE_FILE = 'stats.json';

function getDefaultStats(): Stats {
  return {
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCachedTokens: 0,
    totalCost: 0,
    byApi: {},
    byModel: {}
  };
}

function getStats(): Stats {
  return loadJson<Stats>(STORAGE_FILE, getDefaultStats());
}

function saveStats(stats: Stats): void {
  saveJson(STORAGE_FILE, stats);
}

export async function addStats(data: {
  apiType: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number;
}): Promise<void> {
  const stats = getStats();
  
  stats.totalRequests++;
  stats.totalInputTokens += data.inputTokens;
  stats.totalOutputTokens += data.outputTokens;
  stats.totalCachedTokens += data.cachedTokens;
  stats.totalCost += data.cost;
  
  if (!stats.byApi[data.apiType]) {
    stats.byApi[data.apiType] = { requests: 0, tokens: 0, cost: 0 };
  }
  stats.byApi[data.apiType].requests++;
  stats.byApi[data.apiType].tokens += data.inputTokens + data.outputTokens;
  stats.byApi[data.apiType].cost += data.cost;
  
  if (!stats.byModel[data.model]) {
    stats.byModel[data.model] = { requests: 0, tokens: 0, cost: 0 };
  }
  stats.byModel[data.model].requests++;
  stats.byModel[data.model].tokens += data.inputTokens + data.outputTokens;
  stats.byModel[data.model].cost += data.cost;
  
  saveStats(stats);
}

export async function getSummary(): Promise<Stats> {
  return getStats();
}

export async function resetStats(): Promise<void> {
  saveStats(getDefaultStats());
}

export async function recordRequest(data: {
  apiType: string;
  model: string;
  originalTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  strategies: string[];
}): Promise<void> {
  const stats = getStats();
  
  stats.totalRequests++;
  stats.totalInputTokens += data.originalTokens;
  stats.totalCachedTokens += data.savedTokens;

  if (!stats.byApi[data.apiType]) {
    stats.byApi[data.apiType] = { requests: 0, tokens: 0, cost: 0 };
  }
  stats.byApi[data.apiType].requests++;
  stats.byApi[data.apiType].tokens += data.optimizedTokens;

  if (!stats.byModel[data.model]) {
    stats.byModel[data.model] = { requests: 0, tokens: 0, cost: 0 };
  }
  stats.byModel[data.model].requests++;
  stats.byModel[data.model].tokens += data.optimizedTokens;
  
  saveStats(stats);
}

export default {
  addStats,
  getSummary,
  resetStats,
  recordRequest
};