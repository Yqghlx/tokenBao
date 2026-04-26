import { RequestLog } from '../services/history';

interface BatchOptions {
  enabled: boolean;
  windowMs: number;
  maxBatchSize: number;
}

interface BatchStats {
  batchId: string;
  requestCount: number;
  totalTokens: number;
  avgTokens: number;
  startTime: number;
  endTime: number;
}

const defaultOptions: BatchOptions = {
  enabled: false,
  windowMs: 5000,
  maxBatchSize: 10
};

const pendingBatch: RequestLog[] = [];
const batchHistory: BatchStats[] = [];
let batchTimer: NodeJS.Timeout | null = null;

export function getOptions(): BatchOptions {
  return { ...defaultOptions };
}

export function setOptions(options: Partial<BatchOptions>): void {
  Object.assign(defaultOptions, options);
}

/**
 * 添加请求到批次（仅用于统计）
 */
export function addToBatch(request: RequestLog): void {
  if (!defaultOptions.enabled) return;
  
  if (pendingBatch.length >= defaultOptions.maxBatchSize) {
    flushBatch();
  }
  
  pendingBatch.push(request);
  
  if (!batchTimer && pendingBatch.length > 0) {
    batchTimer = setTimeout(() => {
      flushBatch();
    }, defaultOptions.windowMs);
  }
}

/**
 * 获取当前批次
 */
export function getBatch(): RequestLog[] {
  return [...pendingBatch];
}

/**
 * 清空当前批次
 */
export function clearBatch(): void {
  pendingBatch.length = 0;
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
}

/**
 * 是否有待处理的批次
 */
export function shouldBatch(): boolean {
  return defaultOptions.enabled && pendingBatch.length > 0;
}

/**
 * 完成批次并记录统计
 */
export function flushBatch(): BatchStats | null {
  if (pendingBatch.length === 0) return null;
  
  const batchId = `batch_${Date.now()}`;
  const requestCount = pendingBatch.length;
  const totalTokens = pendingBatch.reduce((sum, r) => sum + (r.inputTokens || 0) + (r.outputTokens || 0), 0);
  const avgTokens = Math.round(totalTokens / requestCount);
  const startTime: number = pendingBatch[0]?.timestamp ? 
    (typeof pendingBatch[0].timestamp === 'number' ? pendingBatch[0].timestamp : Date.now()) 
    : Date.now();
  const endTime = Date.now();
  
  const stats: BatchStats = {
    batchId,
    requestCount,
    totalTokens,
    avgTokens,
    startTime,
    endTime
  };
  
  batchHistory.push(stats);
  
  console.log(`批次完成: ${batchId}, 请求=${requestCount}, 总 Tokens=${totalTokens}, 平均=${avgTokens}`);
  
  clearBatch();
  
  return stats;
}

/**
 * 获取批次历史
 */
export function getBatchHistory(): BatchStats[] {
  return [...batchHistory];
}

/**
 * 获取批次统计摘要
 */
export function getBatchSummary(): { 
  totalBatches: number;
  totalRequests: number;
  avgBatchSize: number;
} {
  const totalBatches = batchHistory.length;
  const totalRequests = batchHistory.reduce((sum, b) => sum + b.requestCount, 0);
  const avgBatchSize = totalBatches > 0 ? Math.round(totalRequests / totalBatches) : 0;
  
  return { totalBatches, totalRequests, avgBatchSize };
}

export default {
  getOptions,
  setOptions,
  addToBatch,
  getBatch,
  clearBatch,
  shouldBatch,
  flushBatch,
  getBatchHistory,
  getBatchSummary
};