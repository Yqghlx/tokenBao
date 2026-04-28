import * as apiKeyService from '../services/apiKey';
import * as historyService from '../services/history';
import * as statsService from '../services/stats';
import * as budgetService from '../services/budget';

describe('apiKey 服务', () => {
  test('添加 API Key 后应能通过列表查询', async () => {
    await apiKeyService.addApiKey('测试 Key', 'openai', 'sk-test-key-1234567890abcdefghij');
    const keys = await apiKeyService.listApiKeys();
    expect(keys.length).toBeGreaterThanOrEqual(1);
    expect(keys[keys.length - 1].name).toBe('测试 Key');
    // 列表中不应包含 encryptedKey 字段（Omit 类型）
    expect((keys[keys.length - 1] as any).encryptedKey).toBeUndefined();
  });

  test('加密解密应一致', async () => {
    const added = await apiKeyService.addApiKey('解密测试', 'anthropic', 'sk-ant-decrypt-test-1234567890abcdefghij');
    const decrypted = await apiKeyService.getDecryptedKey(added.id);
    expect(decrypted).toBe('sk-ant-decrypt-test-1234567890abcdefghij');
  });

  test('按类型查询解密 Key', async () => {
    await apiKeyService.addApiKey('类型查询测试', 'openai', 'sk-type-query-test-99999999999999999999');
    const key = await apiKeyService.getDecryptedKeyByType('openai');
    expect(key).toBeTruthy();
  });

  test('无效格式的密钥应被拒绝', async () => {
    await expect(apiKeyService.addApiKey('无效', 'openai', 'invalid-key')).rejects.toThrow('密钥格式无效');
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
  test('recordOptimization 应更新节省 tokens', async () => {
    const before = await statsService.getSummary();

    await statsService.recordOptimization({
      apiType: 'openai',
      model: 'gpt-4',
      savedTokens: 20,
    });

    const after = await statsService.getSummary();
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

  test('addStats 应拒绝 NaN 的 inputTokens', async () => {
    await statsService.resetStats();
    await statsService.addStats({
      apiType: 'openai',
      model: 'gpt-4',
      inputTokens: NaN,
      outputTokens: 10,
      cachedTokens: 0,
      cost: 0.01
    });
    const summary = await statsService.getSummary();
    expect(summary.totalRequests).toBe(0);
  });

  test('addStats 应拒绝负数的 outputTokens', async () => {
    await statsService.resetStats();
    await statsService.addStats({
      apiType: 'openai',
      model: 'gpt-4',
      inputTokens: 10,
      outputTokens: -5,
      cachedTokens: 0,
      cost: 0.01
    });
    const summary = await statsService.getSummary();
    expect(summary.totalRequests).toBe(0);
  });

  test('addStats 应拒绝 NaN 的 cost', async () => {
    await statsService.resetStats();
    await statsService.addStats({
      apiType: 'openai',
      model: 'gpt-4',
      inputTokens: 10,
      outputTokens: 10,
      cachedTokens: 0,
      cost: NaN
    });
    const summary = await statsService.getSummary();
    expect(summary.totalRequests).toBe(0);
  });

  test('addStats 应拒绝负数的 cachedTokens', async () => {
    await statsService.resetStats();
    await statsService.addStats({
      apiType: 'openai',
      model: 'gpt-4',
      inputTokens: 10,
      outputTokens: 10,
      cachedTokens: -1,
      cost: 0.01
    });
    const summary = await statsService.getSummary();
    expect(summary.totalRequests).toBe(0);
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

  test('resetSpent 应清零日预算支出', async () => {
    await budgetService.updateSpent('daily', 1.5);
    const before = await budgetService.getBudgetStatus();
    expect(before.daily.spent).toBeGreaterThan(0);

    await budgetService.resetSpent('daily');
    const after = await budgetService.getBudgetStatus();
    expect(after.daily.spent).toBe(0);
  });

  test('resetSpent 应清零月预算支出', async () => {
    await budgetService.updateSpent('monthly', 5.0);
    const before = await budgetService.getBudgetStatus();
    expect(before.monthly.spent).toBeGreaterThan(0);

    await budgetService.resetSpent('monthly');
    const after = await budgetService.getBudgetStatus();
    expect(after.monthly.spent).toBe(0);
  });

  test('resetSpent 不应影响预算限额', async () => {
    await budgetService.setBudgetLimit('daily', 50);
    await budgetService.updateSpent('daily', 10);
    await budgetService.resetSpent('daily');
    const status = await budgetService.getBudgetStatus();
    expect(status.daily.limit).toBe(50);
    expect(status.daily.spent).toBe(0);
    // 清理
    await budgetService.setBudgetLimit('daily', 10);
  });

  test('updateSpent 应拒绝 NaN', async () => {
    await budgetService.resetSpent('daily');
    await budgetService.updateSpent('daily', NaN);
    const status = await budgetService.getBudgetStatus();
    expect(status.daily.spent).toBe(0);
  });

  test('updateSpent 应拒绝 Infinity', async () => {
    await budgetService.resetSpent('daily');
    await budgetService.updateSpent('daily', Infinity);
    const status = await budgetService.getBudgetStatus();
    expect(status.daily.spent).toBe(0);
  });

  test('limit=0 应被拒绝', async () => {
    await expect(budgetService.setBudgetLimit('daily', 0)).rejects.toThrow('预算限额必须为正数');
  });

  test('limit 为负数应被拒绝', async () => {
    await expect(budgetService.setBudgetLimit('daily', -10)).rejects.toThrow('预算限额必须为正数');
  });

  test('remaining 不应为负数', async () => {
    await budgetService.setBudgetLimit('daily', 5);
    await budgetService.resetSpent('daily');
    await budgetService.updateSpent('daily', 3);
    await budgetService.updateSpent('daily', 3);
    const status = await budgetService.getBudgetStatus();
    expect(status.daily.remaining).toBe(0);
    // 清理
    await budgetService.setBudgetLimit('daily', 10);
    await budgetService.resetSpent('daily');
  });

  test('累加不应超过 MAX_SAFE_INTEGER', async () => {
    await budgetService.setBudgetLimit('daily', Number.MAX_SAFE_INTEGER);
    await budgetService.resetSpent('daily');
    for (let i = 0; i < 3; i++) {
      await budgetService.updateSpent('daily', Number.MAX_SAFE_INTEGER / 4);
    }
    const status = await budgetService.getBudgetStatus();
    expect(Number.isFinite(status.daily.spent)).toBe(true);
    expect(status.daily.spent).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    // 清理
    await budgetService.setBudgetLimit('daily', 10);
    await budgetService.resetSpent('daily');
  });

  test('getBudget 应返回正确类型和字段', async () => {
    const daily = await budgetService.getBudget('daily');
    expect(daily.type).toBe('daily');
    expect(typeof daily.limit).toBe('number');
    expect(typeof daily.spent).toBe('number');
  });
});

describe('history 输入验证', () => {
  test('addRequest 应拒绝空 apiType', async () => {
    await expect(historyService.addRequest({
      apiType: '', model: 'gpt-4', inputTokens: 10, outputTokens: 10,
      cachedTokens: 0, cost: 0.01, cached: false, timestamp: new Date().toISOString()
    })).rejects.toThrow('apiType 无效');
  });

  test('addRequest 应拒绝负数 inputTokens', async () => {
    await expect(historyService.addRequest({
      apiType: 'openai', model: 'gpt-4', inputTokens: -1, outputTokens: 10,
      cachedTokens: 0, cost: 0.01, cached: false, timestamp: new Date().toISOString()
    })).rejects.toThrow('inputTokens 无效');
  });

  test('addRequest 应拒绝 NaN cost', async () => {
    await expect(historyService.addRequest({
      apiType: 'openai', model: 'gpt-4', inputTokens: 10, outputTokens: 10,
      cachedTokens: 0, cost: NaN, cached: false, timestamp: new Date().toISOString()
    })).rejects.toThrow('cost 无效');
  });

  test('addRequest 应接受有效数据', async () => {
    const result = await historyService.addRequest({
      apiType: 'openai', model: 'gpt-4', inputTokens: 10, outputTokens: 10,
      cachedTokens: 0, cost: 0.01, cached: false, timestamp: new Date().toISOString()
    });
    expect(result.id).toBeGreaterThan(0);
    expect(result.apiType).toBe('openai');
  });
});

describe('apiKey 输入验证', () => {
  test('addApiKey 应拒绝空名称', async () => {
    await expect(apiKeyService.addApiKey('', 'openai', 'sk-test-key-1234567890abcdefghij'))
      .rejects.toThrow('名称不能为空');
  });

  test('addApiKey 应拒绝过长名称', async () => {
    const longName = 'a'.repeat(101);
    await expect(apiKeyService.addApiKey(longName, 'openai', 'sk-test-key-1234567890abcdefghij'))
      .rejects.toThrow('名称不能超过 100 个字符');
  });
});
