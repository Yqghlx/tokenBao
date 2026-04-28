import { applyOptimizations, setOptimizationConfig, getOptimizationConfig } from '../optimizations/index';
import rulesModule from '../optimizations/rules';

describe('优化管线 pipeline', () => {
  // 清理 rules 模块中的测试规则
  const addedRuleIds: number[] = [];

  beforeEach(() => {
    // 清理所有残留规则（包括从持久化文件加载的），确保测试隔离
    rulesModule.listRules().forEach(r => rulesModule.deleteRule(r.id));
    addedRuleIds.length = 0;
  });

  afterEach(() => {
    // 恢复默认配置
    setOptimizationConfig({ caching: true, compression: true, routing: true, batching: false, rules: true, dlp: false });
  });

  afterAll(() => {
    // 清理所有测试添加的规则
    addedRuleIds.forEach(id => rulesModule.deleteRule(id));
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
    const originalSnapshot = structuredClone(body);

    applyOptimizations('openai', body);

    // 原始请求体应完全不变
    expect(body.messages[0].content).toBe(originalContent);
    expect(body).toEqual(originalSnapshot);
  });

  test('rules 策略应在管线中生效', () => {
    const rule = rulesModule.addRule({
      name: '管线测试规则',
      type: 'replace',
      pattern: 'pipeline_test_marker',
      replacement: 'replaced',
      enabled: true,
      priority: 1
    });
    addedRuleIds.push(rule.id);

    const body = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Please pipeline_test_marker here' }]
    };
    const result = applyOptimizations('openai', body);

    // rules 策略应被标记
    expect(result.appliedStrategies.some(s => s.startsWith('rules'))).toBe(true);
    // 替换应在消息内容中生效
    expect(result.modifiedBody.messages[0].content).toContain('replaced');
    expect(result.modifiedBody.messages[0].content).not.toContain('pipeline_test_marker');
    // 原始请求体不受影响
    expect(body.messages[0].content).toContain('pipeline_test_marker');
  });

  test('rules 策略禁用后不应生效', () => {
    const rule = rulesModule.addRule({
      name: '禁用测试规则',
      type: 'replace',
      pattern: 'disabled_marker',
      replacement: 'should_not_appear',
      enabled: true,
      priority: 1
    });
    addedRuleIds.push(rule.id);

    setOptimizationConfig({ rules: false });

    const body = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Please disabled_marker here' }]
    };
    const result = applyOptimizations('openai', body);

    expect(result.appliedStrategies.some(s => s.startsWith('rules'))).toBe(false);
    expect(result.modifiedBody.messages[0].content).toContain('disabled_marker');
  });

  test('rules 策略应用于 array 类型消息', () => {
    const rule = rulesModule.addRule({
      name: '数组消息测试',
      type: 'replace',
      pattern: 'array_marker',
      replacement: 'array_replaced',
      enabled: true,
      priority: 1
    });
    addedRuleIds.push(rule.id);

    const body = {
      model: 'gpt-4',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Please array_marker here' },
          { type: 'image', data: 'base64...' }
        ]
      }]
    };
    const result = applyOptimizations('openai', body);

    const content = result.modifiedBody.messages[0].content as Array<{ type: string; text?: string }>;
    const textBlock = content.find(b => b.type === 'text');
    expect(textBlock!.text).toContain('array_replaced');
  });
});
