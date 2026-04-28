import { RequestLog } from '../services/history';

/**
 * 批量优化模块（实验性）
 * 当前仅用于统计和监控请求批次，不影响实际请求转发。
 * 未来可能支持真正的请求合并以减少 API 调用次数。
 */

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

const MAX_BATCH_HISTORY = 50; // 历史记录上限，防止长时间运行内存泄漏

const pendingBatch: RequestLog[] = [];
const batchHistory: BatchStats[] = [];
let batchTimer: NodeJS.Timeout | null = null;

export function getOptions(): BatchOptions {
  return { ...defaultOptions };
}

export function setOptions(options: Partial<BatchOptions>): void {
  if (options.windowMs !== undefined && (typeof options.windowMs !== 'number' || options.windowMs < 100 || options.windowMs > 60000)) {
    console.warn(`batch.setOptions: windowMs 无效 (${options.windowMs})，已忽略`);
    delete options.windowMs;
  }
  if (options.maxBatchSize !== undefined && (typeof options.maxBatchSize !== 'number' || options.maxBatchSize < 1 || options.maxBatchSize > 100)) {
    console.warn(`batch.setOptions: maxBatchSize 无效 (${options.maxBatchSize})，已忽略`);
    delete options.maxBatchSize;
  }
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
    // 不阻塞进程退出
    if (batchTimer && typeof batchTimer === 'object' && 'unref' in batchTimer) {
      batchTimer.unref();
    }
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
  // timestamp 是 ISO 字符串，解析为毫秒数
  const startTime: number = pendingBatch[0]?.timestamp
    ? new Date(pendingBatch[0].timestamp).getTime()
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
  // FIFO 淘汰最旧记录，防止长时间运行内存泄漏
  if (batchHistory.length > MAX_BATCH_HISTORY) {
    batchHistory.splice(0, batchHistory.length - MAX_BATCH_HISTORY);
  }
  
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