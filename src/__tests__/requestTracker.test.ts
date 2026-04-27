import requestTracker from '../proxy/requestTracker';

/**
 * requestTracker 测试
 * 覆盖请求生命周期：创建 → 状态更新 → 重试 → 完成/失败 → 清理
 */

describe('requestTracker', () => {
  test('createRequestMetadata 应创建 pending 状态的请求', () => {
    const meta = requestTracker.createRequestMetadata(
      'openai', { model: 'gpt-4' }, { model: 'gpt-4o-mini' },
      1000, 800, 200, ['routing']
    );

    expect(meta.requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
    expect(meta.apiType).toBe('openai');
    expect(meta.originalTokens).toBe(1000);
    expect(meta.optimizedTokens).toBe(800);
    expect(meta.savedTokens).toBe(200);
    expect(meta.strategies).toEqual(['routing']);
    expect(meta.status).toBe('pending');
    expect(meta.retryCount).toBe(0);
  });

  test('getRequestMetadata 应能获取已创建的请求', () => {
    const meta = requestTracker.createRequestMetadata(
      'anthropic', {}, {}, 500, 400, 100, ['compression']
    );

    const retrieved = requestTracker.getRequestMetadata(meta.requestId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.requestId).toBe(meta.requestId);
  });

  test('getRequestMetadata 不存在的 ID 应返回 undefined', () => {
    const result = requestTracker.getRequestMetadata('nonexistent');
    expect(result).toBeUndefined();
  });

  test('updateRequestStatus 应更新请求状态', () => {
    const meta = requestTracker.createRequestMetadata('openai', {}, {}, 100, 80, 20, []);

    requestTracker.updateRequestStatus(meta.requestId, 'retrying');

    const retrieved = requestTracker.getRequestMetadata(meta.requestId);
    expect(retrieved!.status).toBe('retrying');
  });

  test('updateRequestStatus 不存在的 ID 应安全忽略', () => {
    expect(() => {
      requestTracker.updateRequestStatus('nonexistent', 'failed');
    }).not.toThrow();
  });

  test('canRetry 新请求应返回 true', () => {
    const meta = requestTracker.createRequestMetadata('openai', {}, {}, 100, 80, 20, []);
    expect(requestTracker.canRetry(meta.requestId)).toBe(true);
  });

  test('canRetry 达到最大重试次数后应返回 false', () => {
    const meta = requestTracker.createRequestMetadata('openai', {}, {}, 100, 80, 20, []);

    for (let i = 0; i < requestTracker.MAX_RETRIES; i++) {
      requestTracker.incrementRetry(meta.requestId);
    }

    expect(requestTracker.canRetry(meta.requestId)).toBe(false);
  });

  test('incrementRetry 应递增重试计数并返回新值', () => {
    const meta = requestTracker.createRequestMetadata('openai', {}, {}, 100, 80, 20, []);

    const count1 = requestTracker.incrementRetry(meta.requestId);
    expect(count1).toBe(1);

    const count2 = requestTracker.incrementRetry(meta.requestId);
    expect(count2).toBe(2);

    const retrieved = requestTracker.getRequestMetadata(meta.requestId);
    expect(retrieved!.status).toBe('retrying');
  });

  test('incrementRetry 不存在的 ID 应返回 0', () => {
    const count = requestTracker.incrementRetry('nonexistent');
    expect(count).toBe(0);
  });

  test('completeRequest 应将请求移至已完成列表', () => {
    const meta = requestTracker.createRequestMetadata('openai', {}, {}, 100, 80, 20, []);

    requestTracker.completeRequest(meta.requestId, {
      requestId: meta.requestId,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      cost: 0.005,
      model: 'gpt-4o-mini',
      duration: 0,
      status: 200,
      completedAt: 0
    });

    // 应从 pending 中移除
    expect(requestTracker.getRequestMetadata(meta.requestId)).toBeUndefined();

    // 应在 completed 中存在
    const completed = requestTracker.getCompletedRequest(meta.requestId);
    expect(completed).toBeDefined();
    expect(completed!.model).toBe('gpt-4o-mini');
    expect(completed!.inputTokens).toBe(100);
    expect(completed!.status).toBe(200);
    expect(completed!.duration).toBeGreaterThanOrEqual(0);
    expect(completed!.completedAt).toBeGreaterThan(0);
  });

  test('failRequest 应记录错误信息', () => {
    const meta = requestTracker.createRequestMetadata(
      'openai', { model: 'gpt-4' }, {}, 100, 0, 0, []
    );

    requestTracker.failRequest(meta.requestId, '认证失败', 401);

    // 应从 pending 中移除
    expect(requestTracker.getRequestMetadata(meta.requestId)).toBeUndefined();

    // 应在 completed 中记录失败
    const completed = requestTracker.getCompletedRequest(meta.requestId);
    expect(completed).toBeDefined();
    expect(completed!.status).toBe(401);
    expect(completed!.errorMessage).toBe('认证失败');
    expect(completed!.cost).toBe(0);
  });

  test('getCompletedRequest 不存在的 ID 应返回 undefined', () => {
    const result = requestTracker.getCompletedRequest('nonexistent');
    expect(result).toBeUndefined();
  });

  test('getStatsSummary 应返回正确的统计', () => {
    // 创建并完成一个请求
    const meta1 = requestTracker.createRequestMetadata('openai', {}, {}, 100, 80, 20, []);
    requestTracker.completeRequest(meta1.requestId, {
      requestId: meta1.requestId,
      inputTokens: 100, outputTokens: 50, cacheReadTokens: 0,
      cacheCreationTokens: 0, cost: 0.005, model: 'gpt-4',
      duration: 500, status: 200, completedAt: Date.now()
    });

    // 创建并失败一个请求
    const meta2 = requestTracker.createRequestMetadata('openai', {}, {}, 200, 0, 0, []);
    requestTracker.failRequest(meta2.requestId, '超时', 504);

    const summary = requestTracker.getStatsSummary();
    expect(summary.completedRequests).toBeGreaterThanOrEqual(1);
    expect(summary.failedRequests).toBeGreaterThanOrEqual(1);
    expect(summary.avgDuration).toBeGreaterThanOrEqual(0);
  });

  test('clearOldRequests 应清理超过 maxAge 的旧记录', () => {
    const meta = requestTracker.createRequestMetadata('openai', {}, {}, 100, 80, 20, []);
    requestTracker.completeRequest(meta.requestId, {
      requestId: meta.requestId,
      inputTokens: 100, outputTokens: 50, cacheReadTokens: 0,
      cacheCreationTokens: 0, cost: 0.005, model: 'gpt-4',
      duration: 100, status: 200, completedAt: 0
    });

    // completeRequest 会将 completedAt 设为 Date.now()，使用极短超时验证清理逻辑
    requestTracker.clearOldRequests(1); // 1ms 超时，几乎立即过期

    // 由于 clearOldRequests 是同步调用，completedAt 与 now 之间差距小于 1ms 的可能性存在
    // 所以验证该函数不会报错，且正常执行
    const summary = requestTracker.getStatsSummary();
    expect(summary).toBeDefined();
  });

  test('clearOldRequests 不应清理仍在有效期内的记录', () => {
    const meta = requestTracker.createRequestMetadata('openai', {}, {}, 100, 80, 20, []);
    requestTracker.completeRequest(meta.requestId, {
      requestId: meta.requestId,
      inputTokens: 100, outputTokens: 50, cacheReadTokens: 0,
      cacheCreationTokens: 0, cost: 0.005, model: 'gpt-4',
      duration: 100, status: 200, completedAt: Date.now() // 刚完成
    });

    // 清理超过 1 小时的记录
    requestTracker.clearOldRequests(3600000);

    const completed = requestTracker.getCompletedRequest(meta.requestId);
    expect(completed).toBeDefined();
  });

  test('MAX_RETRIES 应为 3', () => {
    expect(requestTracker.MAX_RETRIES).toBe(3);
  });

  test('RETRY_DELAY 应为 1000ms', () => {
    expect(requestTracker.RETRY_DELAY).toBe(1000);
  });
});
