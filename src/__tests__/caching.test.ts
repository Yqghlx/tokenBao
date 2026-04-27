import caching from '../optimizations/caching';

describe('caching 模块', () => {
  beforeEach(() => {
    caching.setOptions({ enabled: true, ttl: '5min', scope: 'both' });
  });

  afterEach(() => {
    caching.setOptions({ enabled: true });
  });

  test('addCacheControl 应为 system 添加 cache 标记', () => {
    const content = { system: 'You are a helpful assistant', messages: [] };
    const result = caching.addCacheControl(content);
    expect(Array.isArray(result.system)).toBe(true);
    expect(result.system[0].cache).toBe(true);
  });

  test('禁用后 addCacheControl 不应修改内容', () => {
    caching.setOptions({ enabled: false });
    const content = { system: 'You are helpful', messages: [] };
    const result = caching.addCacheControl(content);
    expect(result.system).toBe('You are helpful');
  });

  test('addCache + checkCache 应正确存储和查询', () => {
    caching.addCache('anthropic', 'test content for cache');
    expect(caching.checkCache('anthropic', 'test content for cache')).toBe(true);
  });

  test('checkCache 对不存在的内容应返回 false', () => {
    expect(caching.checkCache('anthropic', 'non-existent')).toBe(false);
  });

  test('isEnabled 应返回当前启用状态', () => {
    expect(caching.isEnabled()).toBe(true);
    caching.setOptions({ enabled: false });
    expect(caching.isEnabled()).toBe(false);
  });
});
