import * as apiKeyService from '../services/apiKey';
import * as historyService from '../services/history';
import * as statsService from '../services/stats';
import * as budgetService from '../services/budget';

describe('apiKey 服务', () => {
  test('添加 API Key 后应能通过列表查询', async () => {
    await apiKeyService.addApiKey('测试 Key', 'openai', 'sk-test-key-123456');
    const keys = await apiKeyService.listApiKeys();
    expect(keys.length).toBeGreaterThanOrEqual(1);
    expect(keys[keys.length - 1].name).toBe('测试 Key');
    // 列表中 encryptedKey 应被遮罩（运行时仍存在但值为 '***'）
    expect((keys[keys.length - 1] as any).encryptedKey).toBe('***');
  });

  test('加密解密应一致', async () => {
    const added = await apiKeyService.addApiKey('解密测试', 'anthropic', 'sk-ant-decrypt-test-12345');
    const decrypted = await apiKeyService.getDecryptedKey(added.id);
    expect(decrypted).toBe('sk-ant-decrypt-test-12345');
  });

  test('按类型查询解密 Key', async () => {
    await apiKeyService.addApiKey('类型查询测试', 'openai', 'sk-type-query-test-999');
    const key = await apiKeyService.getDecryptedKeyByType('openai');
    expect(key).toBeTruthy();
  });

  test('删除不存在的 Key 应返回 false', async () => {
    const result = await apiKeyService.deleteApiKey(999999);
    expect(result).toBe(false);
  });
});

describe('history 服务', () => {
  test('添加请求后应能查询到', async () => {
    await historyService.addRequest({
      apiType: 'openai',
      model: 'gpt-4',
      inputTokens: 100,
      outputTokens: 50,
      cachedTokens: 0,
      cost: 0.005,
      cached: false,
      timestamp: new Date().toISOString()
    });
    const recent = await historyService.getRecentRequests(1);
    expect(recent.length).toBeGreaterThanOrEqual(1);
    expect(recent[recent.length - 1].model).toBe('gpt-4');
  });

  test('按 apiType 过滤应正确', async () => {
    await historyService.addRequest({
      apiType: 'anthropic',
      model: 'claude-3-sonnet',
      inputTokens: 200,
      outputTokens: 80,
      cachedTokens: 10,
      cost: 0.01,
      cached: true,
      timestamp: new Date().toISOString()
    });
    const filtered = await historyService.listRequests({ apiType: 'anthropic' });
    expect(filtered.every(r => r.apiType === 'anthropic')).toBe(true);
  });

  test('limit 参数应限制返回数量', async () => {
    const list = await historyService.listRequests({ limit: 2 });
    expect(list.length).toBeLessThanOrEqual(2);
  });
});

describe('stats 服务', () => {
  test('recordRequest 应更新统计数据', async () => {
    const before = await statsService.getSummary();
    const beforeTotal = before.totalRequests;

    await statsService.recordRequest({
      apiType: 'openai',
      model: 'gpt-4',
      originalTokens: 100,
      optimizedTokens: 80,
      savedTokens: 20,
      cost: 0.005,
      strategies: ['compression']
    });

    const after = await statsService.getSummary();
    expect(after.totalRequests).toBe(beforeTotal + 1);
    expect(after.totalCachedTokens).toBe(before.totalCachedTokens + 20);
  });

  test('addStats 应更新 byApi 和 byModel', async () => {
    await statsService.addStats({
      apiType: 'anthropic',
      model: 'claude-3-haiku',
      inputTokens: 50,
      outputTokens: 30,
      cachedTokens: 10,
      cost: 0.002
    });

    const summary = await statsService.getSummary();
    expect(summary.byApi['anthropic']).toBeDefined();
    expect(summary.byModel['claude-3-haiku']).toBeDefined();
    expect(summary.byApi['anthropic'].requests).toBeGreaterThan(0);
  });

  test('resetStats 应清零所有统计', async () => {
    await statsService.resetStats();
    const summary = await statsService.getSummary();
    expect(summary.totalRequests).toBe(0);
    expect(summary.totalInputTokens).toBe(0);
  });
});

describe('budget 服务', () => {
  test('getBudgetStatus 应同时返回日和月预算', async () => {
    const status = await budgetService.getBudgetStatus();
    expect(status).toHaveProperty('daily');
    expect(status).toHaveProperty('monthly');
    expect(status.daily).toHaveProperty('limit');
    expect(status.daily).toHaveProperty('spent');
    expect(status.monthly).toHaveProperty('limit');
  });

  test('updateSpent 应增加支出', async () => {
    const before = await budgetService.getBudgetStatus();
    const beforeSpent = before.daily.spent;
    await budgetService.updateSpent('daily', 0.5);
    const after = await budgetService.getBudgetStatus();
    expect(after.daily.spent).toBeCloseTo(beforeSpent + 0.5);
  });

  test('updateSpent 应拒绝负值', async () => {
    const before = await budgetService.getBudgetStatus();
    await budgetService.updateSpent('daily', -10);
    const after = await budgetService.getBudgetStatus();
    expect(after.daily.spent).toBe(before.daily.spent);
  });

  test('setBudgetLimit 应更新限额', async () => {
    await budgetService.setBudgetLimit('monthly', 200);
    const status = await budgetService.getBudgetStatus();
    expect(status.monthly.limit).toBe(200);
  });
});
