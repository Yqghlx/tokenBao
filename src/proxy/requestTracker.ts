interface RequestMetadata {
  requestId: string;
  apiType: string;
  originalBody: any;
  optimizedBody: any;
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
const RETRY_DELAY = 1000;

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function createRequestMetadata(
  apiType: string,
  originalBody: any,
  optimizedBody: any,
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
    // 每次完成后自动清理超过 1 小时的旧记录
    if (completedRequests.size > 100) {
      clearOldRequests();
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
      model: metadata.originalBody?.model || 'unknown',
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
  avgSavedTokens: number;
} {
  const totalRequests = pendingRequests.size + completedRequests.size;
  const pending = pendingRequests.size;
  const completedCount = Array.from(completedRequests.values()).filter(r => r.status < 400).length;
  const failedCount = Array.from(completedRequests.values()).filter(r => r.status >= 400).length;
  
  const durations = Array.from(completedRequests.values()).map(r => r.duration);
  const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  
  const savedTokensList = Array.from(completedRequests.values()).map(r => r.inputTokens > 0 ? r.inputTokens : 0);
  const avgSavedTokens = savedTokensList.length > 0 ? savedTokensList.reduce((a, b) => a + b, 0) / savedTokensList.length : 0;
  
  return {
    totalRequests,
    pendingRequests: pending,
    completedRequests: completedCount,
    failedRequests: failedCount,
    avgDuration: Math.round(avgDuration),
    avgSavedTokens: Math.round(avgSavedTokens)
  };
}

function clearOldRequests(maxAgeMs = 3600000): void {
  const now = Date.now();

  for (const [requestId, result] of completedRequests.entries()) {
    // 使用 completedAt 字段判断过期，而非从已清空的 pendingRequests 查找
    if (result.completedAt && now - result.completedAt > maxAgeMs) {
      completedRequests.delete(requestId);
    }
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
  MAX_RETRIES,
  RETRY_DELAY
};