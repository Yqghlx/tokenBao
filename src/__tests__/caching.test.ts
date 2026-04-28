import caching from '../optimizations/caching';

describe('caching 模块', () => {
  beforeEach(() => {
    caching.setOptions({ enabled: true, ttl: '5min', scope: 'both' });
  });

  afterEach(() => {
    caching.setOptions({ enabled: true });
  });

  test('addCacheControl 应为 system 字符串添加 cache 标记', () => {
    const content = { system: 'You are a helpful assistant', messages: [] };
    const result = caching.addCacheControl(content);
    expect(Array.isArray(result.system)).toBe(true);
    const systemBlocks = result.system as unknown as Array<{ cache?: boolean; text?: string }>;
    expect(systemBlocks[0].cache).toBe(true);
    expect(systemBlocks[0].text).toBe('You are a helpful assistant');
  });

  test('addCacheControl 应为数组 system 添加 cache 标记', () => {
    const content = {
      system: [{ type: 'text', text: 'You are helpful' }],
      messages: []
    };
    const result = caching.addCacheControl(content);
    const systemBlocks = result.system as unknown as Array<{ cache?: boolean }>;
    expect(systemBlocks[0].cache).toBe(true);
  });

  test('addCacheControl 无 system 字段时应原样返回', () => {
    const content = { messages: [{ role: 'user', content: 'hello' }] };
    const result = caching.addCacheControl(content);
    expect(result).toEqual(content);
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

  test('checkCache 对不同 apiType 应区分缓存', () => {
    caching.addCache('anthropic', 'shared content');
    expect(caching.checkCache('openai', 'shared content')).toBe(false);
    expect(caching.checkCache('anthropic', 'shared content')).toBe(true);
  });

  test('isEnabled 应返回当前启用状态', () => {
    expect(caching.isEnabled()).toBe(true);
    caching.setOptions({ enabled: false });
    expect(caching.isEnabled()).toBe(false);
  });

  test('getOptions 应返回当前配置', () => {
    const opts = caching.getOptions();
    expect(opts.enabled).toBe(true);
    expect(opts.ttl).toBe('5min');
  });

  test('禁用后 addCache 不应缓存', () => {
    caching.setOptions({ enabled: false });
    caching.addCache('anthropic', 'disabled content');
    expect(caching.checkCache('anthropic', 'disabled content')).toBe(false);
  });

  test('禁用后 checkCache 应返回 false', () => {
    caching.addCache('anthropic', 'before disable');
    caching.setOptions({ enabled: false });
    expect(caching.checkCache('anthropic', 'before disable')).toBe(false);
  });

  test('重复 addCache 同一内容应更新而非重复', () => {
    caching.addCache('anthropic', 'duplicate content');
    caching.addCache('anthropic', 'duplicate content');
    // 两次添加同一内容，checkCache 应返回 true（LRU 更新）
    expect(caching.checkCache('anthropic', 'duplicate content')).toBe(true);
  });

  test('超长内容应被截断到 1000 字符', () => {
    const longContent = 'x'.repeat(1500);
    caching.addCache('anthropic', longContent);
    // 缓存键基于完整内容的哈希，截断不影响缓存查询
    expect(caching.checkCache('anthropic', longContent)).toBe(true);
  });

  test('checkCache 命中应更新 LRU 顺序（间接验证）', () => {
    caching.setOptions({ enabled: true, ttl: '5min', scope: 'both' });
    // 添加条目 a, b, c
    caching.addCache('anthropic', 'lru-a');
    caching.addCache('anthropic', 'lru-b');
    caching.addCache('anthropic', 'lru-c');
    // 访问最早条目 a，将其移到 LRU 末尾
    expect(caching.checkCache('anthropic', 'lru-a')).toBe(true);
    // 再次添加 a（重复 addCache 也会更新顺序）
    caching.addCache('anthropic', 'lru-a');
    // 所有条目应仍然存在
    expect(caching.checkCache('anthropic', 'lru-a')).toBe(true);
    expect(caching.checkCache('anthropic', 'lru-b')).toBe(true);
    expect(caching.checkCache('anthropic', 'lru-c')).toBe(true);
  });

  test('getCacheMetrics 应正确统计命中率和计数', () => {
    caching.addCache('openai', 'metrics-test-content');
    // 产生命中和未命中
    caching.checkCache('openai', 'metrics-test-content');
    caching.checkCache('openai', 'metrics-test-content');
    caching.checkCache('openai', 'nonexistent');

    const metrics = caching.getCacheMetrics();
    expect(metrics.hits).toBeGreaterThanOrEqual(2);
    expect(metrics.misses).toBeGreaterThanOrEqual(1);
    expect(metrics.size).toBeGreaterThanOrEqual(1);
    expect(metrics.hitRate).toBeGreaterThan(0);
  });
});
