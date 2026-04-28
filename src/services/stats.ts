import { loadJson, saveJsonAsync } from '../utils/storage';
import { getMutex } from '../utils/mutex';

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
const mutex = getMutex(STORAGE_FILE);

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

async function saveStats(stats: Stats): Promise<void> {
  await saveJsonAsync(STORAGE_FILE, stats);
}

/**
 * 记录优化效果（仅在优化生效时调用）
 * 不增加请求计数，仅累加节省 token
 */
export async function recordOptimization(data: {
  apiType: string;
  model: string;
  savedTokens: number;
}): Promise<void> {
  // 输入校验：拒绝 NaN 和负数
  if (isNaN(data.savedTokens) || data.savedTokens < 0) {
    console.warn('stats.recordOptimization: savedTokens 无效，已跳过', data.savedTokens);
    return;
  }

  return mutex.runExclusive(async () => {
    const stats = getStats();
    stats.totalCachedTokens += data.savedTokens;

    if (!stats.byApi[data.apiType]) {
      stats.byApi[data.apiType] = { requests: 0, tokens: 0, cost: 0 };
    }
    stats.byApi[data.apiType].tokens += data.savedTokens;

    if (!stats.byModel[data.model]) {
      stats.byModel[data.model] = { requests: 0, tokens: 0, cost: 0 };
    }
    stats.byModel[data.model].tokens += data.savedTokens;

    // byApi/byModel 费用溢出保护
    for (const entry of Object.values(stats.byApi)) {
      if (!isFinite(entry.tokens)) entry.tokens = 0;
    }
    for (const entry of Object.values(stats.byModel)) {
      if (!isFinite(entry.tokens)) entry.tokens = 0;
    }

    await saveStats(stats);
  });
}

/**
 * 记录一次 API 请求的完整统计
 * 包含实际的 token 用量和费用
 */
export async function addStats(data: {
  apiType: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number;
}): Promise<void> {
  // 输入校验：拒绝 NaN 和负数
  if (isNaN(data.inputTokens) || data.inputTokens < 0) {
    console.warn('stats.addStats: inputTokens 无效，已跳过', data.inputTokens);
    return;
  }
  if (isNaN(data.outputTokens) || data.outputTokens < 0) {
    console.warn('stats.addStats: outputTokens 无效，已跳过', data.outputTokens);
    return;
  }
  if (isNaN(data.cachedTokens) || data.cachedTokens < 0) {
    console.warn('stats.addStats: cachedTokens 无效，已跳过', data.cachedTokens);
    return;
  }
  if (isNaN(data.cost) || data.cost < 0) {
    console.warn('stats.addStats: cost 无效，已跳过', data.cost);
    return;
  }

  return mutex.runExclusive(async () => {
    const stats = getStats();

    // 记录累加前快照，Infinity/NaN 时回退到上次有效值而非 0
    const prevCost = stats.totalCost;
    const prevInput = stats.totalInputTokens;
    const prevOutput = stats.totalOutputTokens;
    const prevCached = stats.totalCachedTokens;

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

    // 后置完整性检查：Infinity/NaN 回退到累加前有效值，避免丢失历史累积
    if (!isFinite(stats.totalCost)) {
      console.warn(`stats.totalCost 变为 ${stats.totalCost}，回退到 ${prevCost}`);
      stats.totalCost = prevCost;
    }
    if (!isFinite(stats.totalInputTokens)) {
      console.warn(`stats.totalInputTokens 变为 ${stats.totalInputTokens}，回退到 ${prevInput}`);
      stats.totalInputTokens = prevInput;
    }
    if (!isFinite(stats.totalOutputTokens)) {
      console.warn(`stats.totalOutputTokens 变为 ${stats.totalOutputTokens}，回退到 ${prevOutput}`);
      stats.totalOutputTokens = prevOutput;
    }
    if (!isFinite(stats.totalCachedTokens)) {
      console.warn(`stats.totalCachedTokens 变为 ${stats.totalCachedTokens}，回退到 ${prevCached}`);
      stats.totalCachedTokens = prevCached;
    }
    // byApi/byModel 费用也需检查，防止 Infinity 污染前端显示
    for (const entry of Object.values(stats.byApi)) {
      if (!isFinite(entry.cost)) entry.cost = 0;
      if (!isFinite(entry.tokens)) entry.tokens = 0;
    }
    for (const entry of Object.values(stats.byModel)) {
      if (!isFinite(entry.cost)) entry.cost = 0;
      if (!isFinite(entry.tokens)) entry.tokens = 0;
    }

    await saveStats(stats);
  });
}

export async function getSummary(): Promise<Stats> {
  return mutex.runExclusive(() => getStats());
}

export async function resetStats(): Promise<void> {
  return mutex.runExclusive(async () => {
    await saveStats(getDefaultStats());
  });
}

export default {
  addStats,
  getSummary,
  resetStats,
  recordOptimization
};
