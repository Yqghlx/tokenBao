import { applyOptimizations, setOptimizationConfig, getOptimizationConfig } from '../optimizations/index';

describe('优化管线 pipeline', () => {
  afterEach(() => {
    // 恢复默认配置
    setOptimizationConfig({ caching: true, compression: true, routing: true, batching: false, rules: true });
  });

  test('空 body 应返回空结果', () => {
    const result = applyOptimizations('openai', {} as any);
    expect(result.appliedStrategies).toEqual([]);
    expect(result.savedTokens).toBe(0);
  });

  test('无 messages 的 body 应返回空结果', () => {
    const result = applyOptimizations('openai', { model: 'gpt-4' } as any);
    expect(result.appliedStrategies).toEqual([]);
  });

  test('压缩应应用于 string 类型消息', () => {
    const body = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Please help me with this task' }]
    };
    const result = applyOptimizations('openai', body);
    expect(result.appliedStrategies).toContain('compression');
    expect(result.modifiedBody.messages[0].content).not.toContain('Please');
  });

  test('压缩应应用于 array 类型消息', () => {
    const body = {
      model: 'gpt-4',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Please help me with this' },
          { type: 'image', data: 'base64...' }
        ]
      }]
    };
    const result = applyOptimizations('openai', body);
    expect(result.appliedStrategies).toContain('compression');
    const content = result.modifiedBody.messages[0].content as Array<{ type: string; text?: string; data?: string }>;
    const textBlock = content.find((b) => b.type === 'text');
    expect(textBlock!.text).not.toContain('Please');
    const imgBlock = content.find((b) => b.type === 'image');
    expect(imgBlock!.data).toBe('base64...');
  });

  test('路由应降级模型', () => {
    const body = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'List the main topics' }]
    };
    const result = applyOptimizations('openai', body);
    expect(result.modifiedBody.model).not.toBe('gpt-4');
    expect(result.appliedStrategies.some(s => s.startsWith('routing:'))).toBe(true);
  });

  test('Anthropic 应添加 caching 标记', () => {
    const body = {
      model: 'claude-3-sonnet',
      messages: [{ role: 'user', content: 'Hello' }],
      system: 'You are helpful'
    };
    const result = applyOptimizations('anthropic', body);
    expect(result.appliedStrategies).toContain('caching');
  });

  test('OpenAI 不应添加 caching 标记', () => {
    const body = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      system: 'You are helpful'
    };
    const result = applyOptimizations('openai', body);
    expect(result.appliedStrategies).not.toContain('caching');
  });

  test('禁用所有优化后应无策略应用', () => {
    setOptimizationConfig({ caching: false, compression: false, routing: false, batching: false, rules: false });
    const body = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Please help me with this task' }]
    };
    const result = applyOptimizations('openai', body);
    expect(result.appliedStrategies).toEqual([]);
    expect(result.modifiedBody.messages[0].content).toBe('Please help me with this task');
  });

  test('getOptimizationConfig 应返回当前配置副本', () => {
    setOptimizationConfig({ compression: false });
    const config = getOptimizationConfig();
    expect(config.compression).toBe(false);
    // 修改返回值不应影响内部状态
    config.compression = true;
    expect(getOptimizationConfig().compression).toBe(false);
  });

  test('originalTokens 和 optimizedTokens 应正确计算', () => {
    const body = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Please help me' }]
    };
    const result = applyOptimizations('openai', body);
    expect(result.originalTokens).toBeGreaterThan(0);
    // 压缩后 token 应少于原始 token
    expect(result.optimizedTokens).toBeLessThanOrEqual(result.originalTokens);
  });

  test('优化不应修改原始请求体（深拷贝保护）', () => {
    const originalContent = 'Please help me with this task in order to succeed';
    const body = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: originalContent }]
    };
    // 保存原始快照
    const originalSnapshot = JSON.parse(JSON.stringify(body));

    applyOptimizations('openai', body);

    // 原始请求体应完全不变
    expect(body.messages[0].content).toBe(originalContent);
    expect(body).toEqual(originalSnapshot);
  });
});
