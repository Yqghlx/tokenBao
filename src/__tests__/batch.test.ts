import * as batch from '../optimizations/batch';

describe('batch 批量优化模块', () => {
  beforeEach(() => {
    batch.setOptions({ enabled: true, windowMs: 5000, maxBatchSize: 10 });
    batch.clearBatch();
    // 重新初始化模块状态
    batch.setOptions({ enabled: false });
    batch.setOptions({ enabled: true });
  });

  test('禁用时不接受批次请求', () => {
    batch.setOptions({ enabled: false });
    batch.addToBatch({ id: 1, method: 'POST', path: '/v1/chat/completions', timestamp: Date.now() } as any);
    expect(batch.getBatch()).toHaveLength(0);
  });

  test('启用时可以添加请求到批次', () => {
    batch.setOptions({ enabled: true });
    batch.addToBatch({ id: 1, method: 'POST', path: '/v1/chat/completions', timestamp: Date.now() } as any);
    expect(batch.getBatch()).toHaveLength(1);
  });

  test('达到最大批次大小时自动 flush', () => {
    batch.setOptions({ maxBatchSize: 3 });
    for (let i = 0; i < 3; i++) {
      batch.addToBatch({ id: i, method: 'POST', path: '/v1/chat/completions', timestamp: Date.now() } as any);
    }
    // 3 个请求时 length=3，尚未触发 flush
    expect(batch.getBatch()).toHaveLength(3);
    // 添加第 4 个请求时触发 flush
    batch.addToBatch({ id: 3, method: 'POST', path: '/v1/chat/completions', timestamp: Date.now() } as any);
    // flush 后只剩第 4 个请求
    expect(batch.getBatch()).toHaveLength(1);
    const summary = batch.getBatchSummary();
    expect(summary.totalBatches).toBe(1);
    expect(summary.totalRequests).toBe(3);
  });

  test('clearBatch 应清空待处理批次', () => {
    batch.addToBatch({ id: 1, method: 'POST', path: '/v1/chat/completions', timestamp: Date.now() } as any);
    batch.clearBatch();
    expect(batch.getBatch()).toHaveLength(0);
  });

  test('flushBatch 空批次返回 null', () => {
    expect(batch.flushBatch()).toBeNull();
  });

  test('shouldBatch 未启用时返回 false', () => {
    batch.setOptions({ enabled: false });
    expect(batch.shouldBatch()).toBe(false);
  });

  test('getBatchSummary 有 flush 历史时返回正确统计', () => {
    // 前面的测试已经 flush 过，所以历史不为空
    const summary = batch.getBatchSummary();
    expect(summary.totalBatches).toBeGreaterThanOrEqual(1);
    expect(summary.totalRequests).toBeGreaterThanOrEqual(3);
    expect(summary.avgBatchSize).toBeGreaterThan(0);
  });
});
