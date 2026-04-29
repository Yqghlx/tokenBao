import { loadJson, saveJsonAsync } from '../utils/storage';
import { getMutex } from '../utils/mutex';
import cachingModule from '../optimizations/caching';

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

/** 预编译验证正则，避免每次调用时重复编译 */
const API_TYPE_REGEX = /^[a-zA-Z0-9_-]+$/;
const MODEL_NAME_REGEX = /^[a-zA-Z0-9._:-]+$/;

/** 共享输入验证：apiType/model 字符串校验（消除两个导出函数中的重复代码） */
function validateIdentifiers(apiType: string, model: string): boolean {
  if (typeof apiType !== 'string' || apiType.length > 50 || !API_TYPE_REGEX.test(apiType)) return false;
  if (typeof model !== 'string' || model.length > 100 || !MODEL_NAME_REGEX.test(model)) return false;
  return true;
}

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
  // 输入校验：拒绝无效字符串（防原型污染键注入）
  if (!validateIdentifiers(data.apiType, data.model)) {
    console.warn('stats.recordOptimization: apiType 或 model 无效，已跳过', data.apiType, data.model);
    return;
  }
  // 输入校验：拒绝非有限数和负数（Number.isFinite 同时拦截 null/NaN/Infinity）
  if (!Number.isFinite(data.savedTokens) || data.savedTokens < 0) {
    console.warn('stats.recordOptimization: savedTokens 无效，已跳过', data.savedTokens);
    return;
  }

  return mutex.runExclusive(async () => {
    const stats = getStats();
    stats.totalCachedTokens += data.savedTokens;

    // 后置检查：磁盘数据损坏时 NaN/Infinity 传播到累加值，回退到 0
    if (!Number.isFinite(stats.totalCachedTokens)) {
      console.warn(`stats.totalCachedTokens 变为 ${stats.totalCachedTokens}，重置为 0`);
      stats.totalCachedTokens = 0;
    }

    if (!stats.byApi[data.apiType]) {
      stats.byApi[data.apiType] = { requests: 0, tokens: 0, cost: 0 };
    }
    const apiEntry = stats.byApi[data.apiType];
    apiEntry.tokens += data.savedTokens;

    if (!stats.byModel[data.model]) {
      stats.byModel[data.model] = { requests: 0, tokens: 0, cost: 0 };
    }
    const modelEntry = stats.byModel[data.model];
    modelEntry.tokens += data.savedTokens;

    // 仅检查本次修改的条目，而非全量遍历
    if (!Number.isFinite(apiEntry.tokens)) apiEntry.tokens = 0;
    if (!Number.isFinite(modelEntry.tokens)) modelEntry.tokens = 0;

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
  // 输入校验：拒绝无效字符串（防原型污染键注入）
  if (!validateIdentifiers(data.apiType, data.model)) {
    console.warn('stats.addStats: apiType 或 model 无效，已跳过', data.apiType, data.model);
    return;
  }
  // 输入校验：拒绝非有限数和负数（Number.isFinite 同时拦截 null/NaN/Infinity）
  if (!Number.isFinite(data.inputTokens) || data.inputTokens < 0) {
    console.warn('stats.addStats: inputTokens 无效，已跳过', data.inputTokens);
    return;
  }
  if (!Number.isFinite(data.outputTokens) || data.outputTokens < 0) {
    console.warn('stats.addStats: outputTokens 无效，已跳过', data.outputTokens);
    return;
  }
  if (!Number.isFinite(data.cachedTokens) || data.cachedTokens < 0) {
    console.warn('stats.addStats: cachedTokens 无效，已跳过', data.cachedTokens);
    return;
  }
  if (!Number.isFinite(data.cost) || data.cost < 0) {
    console.warn('stats.addStats: cost 无效，已跳过', data.cost);
    return;
  }

  return mutex.runExclusive(async () => {
    const stats = getStats();

    // 记录累加前快照，磁盘数据损坏时 NaN/Infinity 不可作为回退值，归零处理
    const prevCost = Number.isFinite(stats.totalCost) ? stats.totalCost : 0;
    const prevInput = Number.isFinite(stats.totalInputTokens) ? stats.totalInputTokens : 0;
    const prevOutput = Number.isFinite(stats.totalOutputTokens) ? stats.totalOutputTokens : 0;
    const prevCached = Number.isFinite(stats.totalCachedTokens) ? stats.totalCachedTokens : 0;

    stats.totalRequests++;
    stats.totalInputTokens += data.inputTokens;
    stats.totalOutputTokens += data.outputTokens;
    stats.totalCachedTokens += data.cachedTokens;
    stats.totalCost += data.cost;

    if (!stats.byApi[data.apiType]) {
      stats.byApi[data.apiType] = { requests: 0, tokens: 0, cost: 0 };
    }
    const apiEntry = stats.byApi[data.apiType];
    const tokenSum = data.inputTokens + data.outputTokens;
    apiEntry.requests++;
    apiEntry.tokens += tokenSum;
    apiEntry.cost += data.cost;

    if (!stats.byModel[data.model]) {
      stats.byModel[data.model] = { requests: 0, tokens: 0, cost: 0 };
    }
    const modelEntry = stats.byModel[data.model];
    modelEntry.requests++;
    modelEntry.tokens += tokenSum;
    modelEntry.cost += data.cost;

    // 后置完整性检查：Infinity/NaN 回退到累加前有效值，避免丢失历史累积
    if (!Number.isFinite(stats.totalCost)) {
      console.warn(`stats.totalCost 变为 ${stats.totalCost}，回退到 ${prevCost}`);
      stats.totalCost = prevCost;
    }
    if (!Number.isFinite(stats.totalInputTokens)) {
      console.warn(`stats.totalInputTokens 变为 ${stats.totalInputTokens}，回退到 ${prevInput}`);
      stats.totalInputTokens = prevInput;
    }
    if (!Number.isFinite(stats.totalOutputTokens)) {
      console.warn(`stats.totalOutputTokens 变为 ${stats.totalOutputTokens}，回退到 ${prevOutput}`);
      stats.totalOutputTokens = prevOutput;
    }
    if (!Number.isFinite(stats.totalCachedTokens)) {
      console.warn(`stats.totalCachedTokens 变为 ${stats.totalCachedTokens}，回退到 ${prevCached}`);
      stats.totalCachedTokens = prevCached;
    }
    // 仅检查本次修改的 byApi/byModel 条目，防止 Infinity 污染前端显示
    if (!Number.isFinite(apiEntry.cost)) apiEntry.cost = 0;
    if (!Number.isFinite(apiEntry.tokens)) apiEntry.tokens = 0;
    if (!Number.isFinite(modelEntry.cost)) modelEntry.cost = 0;
    if (!Number.isFinite(modelEntry.tokens)) modelEntry.tokens = 0;

    await saveStats(stats);
  });
}

export async function getSummary(): Promise<Stats & { cacheMetrics: { hits: number; misses: number; size: number; hitRate: number } }> {
  const stats = await mutex.runExclusive(() => getStats());
  return { ...stats, cacheMetrics: cachingModule.getCacheMetrics() };
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
