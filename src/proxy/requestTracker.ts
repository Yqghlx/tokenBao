import crypto from 'crypto';

interface RequestMetadata {
  requestId: string;
  apiType: string;
  originalBody: Record<string, unknown>;
  optimizedBody: Record<string, unknown>;
  originalTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  strategies: string[];
  startTime: number;
  retryCount: number;
  status: 'pending' | 'completed' | 'failed' | 'retrying';
}

interface RequestResult {
  requestId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cost: number;
  model: string;
  duration: number;
  status: number;
  completedAt: number;
  errorMessage?: string;
}

const pendingRequests: Map<string, RequestMetadata> = new Map();
const completedRequests: Map<string, RequestResult> = new Map();
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 500; // 指数退避基础延迟 500ms
const COMPLETED_MAX_SIZE = 50; // 完成请求最大保留数量
const CLEANUP_INTERVAL_MS = 300000; // 每 5 分钟自动清理过期记录
const STALE_PENDING_MS = 600000; // pending 超过 10 分钟视为僵尸请求

/** 定期清理过期记录，防止长时间运行内存膨胀 */
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startAutoCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    clearOldRequests();
    // 如果清理后仍超过上限，按时间戳淘汰最早的记录
    if (completedRequests.size > COMPLETED_MAX_SIZE) {
      const entries = Array.from(completedRequests.entries())
        .sort((a, b) => (a[1].completedAt || 0) - (b[1].completedAt || 0));
      const removeCount = completedRequests.size - COMPLETED_MAX_SIZE;
      for (let i = 0; i < removeCount; i++) {
        completedRequests.delete(entries[i][0]);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // 允许进程退出时自动停止
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

function stopAutoCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

// 启动自动清理
startAutoCleanup();

/**
 * 判断 HTTP 状态码是否为可重试错误
 * 4xx 为客户端错误不应重试，5xx/网络异常为临时故障可重试
 */
function isRetryableStatus(statusCode: number): boolean {
  // 408 Request Timeout、429 Too Many Requests 可重试
  if (statusCode === 408 || statusCode === 429) return true;
  // 5xx 服务端错误可重试
  if (statusCode >= 500) return true;
  return false;
}

/**
 * 计算指数退避延迟（含 jitter 防惊群）
 * 公式: min(BASE_DELAY * 2^attempt, MAX_RETRY_DELAY) + random(0, BASE_DELAY/2)
 */
const MAX_RETRY_DELAY = 30000; // 最大退避 30 秒

function getRetryDelay(attempt: number): number {
  const delay = Math.min(BASE_RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);
  const jitter = Math.random() * (BASE_RETRY_DELAY / 2);
  return delay + jitter;
}

function generateRequestId(): string {
  const uuid = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `req_${uuid}`;
}

function createRequestMetadata(
  apiType: string,
  originalBody: Record<string, unknown>,
  optimizedBody: Record<string, unknown>,
  originalTokens: number,
  optimizedTokens: number,
  savedTokens: number,
  strategies: string[]
): RequestMetadata {
  const requestId = generateRequestId();
  
  const metadata: RequestMetadata = {
    requestId,
    apiType,
    originalBody,
    optimizedBody,
    originalTokens,
    optimizedTokens,
    savedTokens,
    strategies,
    startTime: Date.now(),
    retryCount: 0,
    status: 'pending'
  };
  
  pendingRequests.set(requestId, metadata);
  return metadata;
}

function getRequestMetadata(requestId: string): RequestMetadata | undefined {
  return pendingRequests.get(requestId);
}

function updateRequestStatus(requestId: string, status: 'pending' | 'completed' | 'failed' | 'retrying'): void {
  const metadata = pendingRequests.get(requestId);
  if (metadata) {
    metadata.status = status;
  }
}

function incrementRetry(requestId: string): number {
  const metadata = pendingRequests.get(requestId);
  if (metadata) {
    metadata.retryCount++;
    metadata.status = 'retrying';
    return metadata.retryCount;
  }
  return 0;
}

function canRetry(requestId: string): boolean {
  const metadata = pendingRequests.get(requestId);
  if (!metadata) return false;
  return metadata.retryCount < MAX_RETRIES;
}

function completeRequest(requestId: string, result: RequestResult): void {
  const metadata = pendingRequests.get(requestId);
  if (metadata) {
    metadata.status = 'completed';
    result.duration = Date.now() - metadata.startTime;
    result.completedAt = Date.now();
    completedRequests.set(requestId, result);
    pendingRequests.delete(requestId);
    // 容量保护：超限时立即按时间戳淘汰最早的记录
    if (completedRequests.size > COMPLETED_MAX_SIZE) {
      const entries = Array.from(completedRequests.entries())
        .sort((a, b) => a[1].completedAt - b[1].completedAt);
      const removeCount = completedRequests.size - COMPLETED_MAX_SIZE;
      for (let i = 0; i < removeCount; i++) {
        completedRequests.delete(entries[i][0]);
      }
    }
  }
}

function failRequest(requestId: string, errorMessage: string, statusCode: number): void {
  const metadata = pendingRequests.get(requestId);
  if (metadata) {
    metadata.status = 'failed';
    const result: RequestResult = {
      requestId,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      cost: 0,
      model: (metadata.originalBody?.model as string) || 'unknown',
      duration: Date.now() - metadata.startTime,
      completedAt: Date.now(),
      status: statusCode,
      errorMessage
    };
    completedRequests.set(requestId, result);
    pendingRequests.delete(requestId);
  }
}

function getCompletedRequest(requestId: string): RequestResult | undefined {
  return completedRequests.get(requestId);
}

function getStatsSummary(): {
  totalRequests: number;
  pendingRequests: number;
  completedRequests: number;
  failedRequests: number;
  avgDuration: number;
  avgInputTokens: number;
} {
  const totalRequests = pendingRequests.size + completedRequests.size;
  const pending = pendingRequests.size;

  // 单次遍历合并所有统计，避免对 Map 做 4 次 Array.from + filter/map
  let completedCount = 0;
  let failedCount = 0;
  let totalDuration = 0;
  let totalInputTokens = 0;
  for (const r of completedRequests.values()) {
    totalDuration += r.duration;
    totalInputTokens += r.inputTokens;
    if (r.status < 400) {
      completedCount++;
    } else {
      failedCount++;
    }
  }

  const completedSize = completedRequests.size;
  const avgDuration = completedSize > 0 && Number.isFinite(totalDuration) ? totalDuration / completedSize : 0;
  const avgInputTokens = completedCount > 0 && Number.isFinite(totalInputTokens) ? totalInputTokens / completedCount : 0;

  return {
    totalRequests,
    pendingRequests: pending,
    completedRequests: completedCount,
    failedRequests: failedCount,
    avgDuration: Math.round(avgDuration),
    avgInputTokens: Math.round(avgInputTokens)
  };
}

function clearOldRequests(maxAgeMs = 3600000): void {
  const now = Date.now();

  // 清理过期已完成请求
  for (const [requestId, result] of completedRequests.entries()) {
    if (result.completedAt && now - result.completedAt > maxAgeMs) {
      completedRequests.delete(requestId);
    }
  }

  // 清理僵尸 pending 请求（超时未完成的请求）
  let staleCount = 0;
  for (const [requestId, metadata] of pendingRequests.entries()) {
    if (now - metadata.startTime > STALE_PENDING_MS) {
      // 将僵尸请求记录为失败，保留遥测数据
      if (!completedRequests.has(requestId)) {
        completedRequests.set(requestId, {
          requestId,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          cost: 0,
          model: (metadata.originalBody?.model as string) || 'unknown',
          duration: now - metadata.startTime,
          status: 500,
          completedAt: now,
          errorMessage: '请求超时未完成（僵尸清理）',
        });
      }
      pendingRequests.delete(requestId);
      staleCount++;
    }
  }
  if (staleCount > 0) {
    console.warn(`requestTracker: 清理 ${staleCount} 个僵尸 pending 请求（>${STALE_PENDING_MS / 1000}s）`);
  }
}

export default {
  generateRequestId,
  createRequestMetadata,
  getRequestMetadata,
  updateRequestStatus,
  incrementRetry,
  canRetry,
  completeRequest,
  failRequest,
  getCompletedRequest,
  getStatsSummary,
  clearOldRequests,
  startAutoCleanup,
  stopAutoCleanup,
  isRetryableStatus,
  getRetryDelay,
  MAX_RETRIES,
  BASE_RETRY_DELAY
};