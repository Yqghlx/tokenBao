/**
 * rules 优化模块测试
 * 覆盖 addRule/listRules/getRule/updateRule/deleteRule/applyRules/safeRegexReplace
 */

import rulesModule from '../optimizations/rules';

describe('rules 优化模块', () => {
  // 清理：每个测试前删除所有规则
  beforeEach(() => {
    rulesModule.listRules().forEach(r => rulesModule.deleteRule(r.id));
  });

  test('addRule 应创建规则并分配 ID', () => {
    const rule = rulesModule.addRule({
      name: '测试规则',
      type: 'replace',
      pattern: 'hello',
      replacement: 'world',
      enabled: true,
      priority: 1
    });

    expect(rule.id).toBeGreaterThan(0);
    expect(rule.name).toBe('测试规则');
    expect(rule.type).toBe('replace');
  });

  test('addRule 模式超长应抛出错误', () => {
    expect(() => {
      rulesModule.addRule({
        name: '超长',
        type: 'replace',
        pattern: 'a'.repeat(501),
        replacement: 'b',
        enabled: true,
        priority: 1
      });
    }).toThrow('正则表达式长度不能超过 500 字符');
  });

  test('listRules 应按优先级降序返回', () => {
    rulesModule.addRule({ name: '低', type: 'replace', pattern: 'a', replacement: 'b', enabled: true, priority: 1 });
    rulesModule.addRule({ name: '高', type: 'replace', pattern: 'c', replacement: 'd', enabled: true, priority: 10 });

    const list = rulesModule.listRules();
    expect(list.length).toBeGreaterThanOrEqual(2);
    // 优先级高的在前
    expect(list[0].name).toBe('高');
    expect(list[1].name).toBe('低');
  });

  test('getRule 应返回指定规则', () => {
    const rule = rulesModule.addRule({ name: '查询', type: 'replace', pattern: 'x', replacement: 'y', enabled: true, priority: 1 });

    const found = rulesModule.getRule(rule.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe('查询');
  });

  test('getRule 不存在的 ID 应返回 undefined', () => {
    expect(rulesModule.getRule(99999)).toBeUndefined();
  });

  test('updateRule 应更新规则属性', () => {
    const rule = rulesModule.addRule({ name: '原始', type: 'replace', pattern: 'a', replacement: 'b', enabled: true, priority: 1 });

    const updated = rulesModule.updateRule(rule.id, { name: '已更新', enabled: false });
    expect(updated!.name).toBe('已更新');
    expect(updated!.enabled).toBe(false);
  });

  test('updateRule 不存在的 ID 应返回 undefined', () => {
    const result = rulesModule.updateRule(99999, { name: '不存在' });
    expect(result).toBeUndefined();
  });

  test('deleteRule 应删除规则', () => {
    const rule = rulesModule.addRule({ name: '删除测试', type: 'replace', pattern: 'a', replacement: 'b', enabled: true, priority: 1 });
    const result = rulesModule.deleteRule(rule.id);
    expect(result).toBe(true);
    expect(rulesModule.getRule(rule.id)).toBeUndefined();
  });

  test('deleteRule 不存在的 ID 应返回 false', () => {
    expect(rulesModule.deleteRule(99999)).toBe(false);
  });

  test('applyRules 应对启用规则执行正则替换', () => {
    rulesModule.addRule({ name: '替换', type: 'replace', pattern: 'foo', replacement: 'bar', enabled: true, priority: 1 });

    const result = rulesModule.applyRules('hello foo world foo');
    expect(result).toBe('hello bar world bar');
  });

  test('applyRules 禁用规则不应生效', () => {
    rulesModule.addRule({ name: '禁用', type: 'replace', pattern: 'foo', replacement: 'bar', enabled: false, priority: 1 });

    const result = rulesModule.applyRules('hello foo world');
    expect(result).toBe('hello foo world');
  });

  test('applyRules 支持正则表达式模式', () => {
    rulesModule.addRule({ name: '数字替换', type: 'replace', pattern: '\\d+', replacement: 'NUM', enabled: true, priority: 1 });

    const result = rulesModule.applyRules('订单 123 包含 456 个物品');
    expect(result).toBe('订单 NUM 包含 NUM 个物品');
  });

  test('applyRules 无规则时应返回原文', () => {
    const result = rulesModule.applyRules('hello world');
    expect(result).toBe('hello world');
  });

  test('非法正则应在添加时被拒绝', () => {
    // addRule 现在会验证正则语法，非法正则直接抛错
    expect(() => {
      rulesModule.addRule({ name: '非法正则', type: 'replace', pattern: '(unclosed', replacement: 'ok', enabled: true, priority: 1 });
    }).toThrow('正则表达式语法错误');
  });

  test('validatePattern 应返回合法正则的 null', () => {
    expect(rulesModule.validatePattern('\\d+')).toBeNull();
    expect(rulesModule.validatePattern('hello')).toBeNull();
  });

  test('validatePattern 应返回非法正则的错误信息', () => {
    expect(rulesModule.validatePattern('(unclosed')).toBeTruthy();
    expect(rulesModule.validatePattern('')).toBeTruthy();
  });

  test('validatePattern 应拒绝过长的正则', () => {
    const long = 'a'.repeat(501);
    expect(rulesModule.validatePattern(long)).toContain('500');
  });

  test('多个规则应按优先级顺序应用', () => {
    rulesModule.addRule({ name: '先执行', type: 'replace', pattern: 'a', replacement: 'b', enabled: true, priority: 2 });
    rulesModule.addRule({ name: '后执行', type: 'replace', pattern: 'b', replacement: 'c', enabled: true, priority: 1 });

    // 先执行高优先级：a→b，再执行低优先级：b→c
    const result = rulesModule.applyRules('a');
    expect(result).toBe('c');
  });

  test('非 replace 类型规则不应在 applyRules 中生效', () => {
    rulesModule.addRule({ name: '过滤规则', type: 'filter', pattern: 'test', replacement: '', enabled: true, priority: 1 });

    // filter 类型不处理，原文不变
    const result = rulesModule.applyRules('test content');
    expect(result).toBe('test content');
  });
});
