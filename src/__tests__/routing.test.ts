import routing from '../optimizations/routing';

describe('routing 模块', () => {
  afterEach(() => {
    routing.setOptions({ enabled: true });
  });

  test('分类任务应检测为 classification', () => {
    expect(routing.detectComplexity('Classify this text as positive or negative')).toBe('classification');
  });

  test('提取任务应检测为 extraction', () => {
    expect(routing.detectComplexity('Extract all email addresses from this text')).toBe('extraction');
  });

  test('分析任务应检测为复杂', () => {
    expect(routing.detectComplexity('Analyze why this algorithm fails and suggest improvements')).toBe('complex');
  });

  test('设计任务应检测为复杂', () => {
    expect(routing.detectComplexity('Design a scalable architecture for this system')).toBe('complex');
  });

  test('无关键词应检测为 unknown', () => {
    expect(routing.detectComplexity('Hello world')).toBe('unknown');
  });

  test('unknown 复杂度应保持原模型不降级', () => {
    expect(routing.routeModel('gpt-4', 'Hello world')).toBe('gpt-4');
  });

  test('分类任务应将 gpt-4 降级为 gpt-4o-mini', () => {
    expect(routing.routeModel('gpt-4', 'Classify this feedback')).toBe('gpt-4o-mini');
  });

  test('提取任务应将 gpt-4o 降级为 gpt-4o-mini', () => {
    expect(routing.routeModel('gpt-4o', 'Extract the key points')).toBe('gpt-4o-mini');
  });

  test('复杂任务应保持 gpt-4 不变', () => {
    expect(routing.routeModel('gpt-4', 'Design a new feature')).toBe('gpt-4');
  });

  test('简单任务应将 claude-3-opus 降级为 claude-3-haiku', () => {
    expect(routing.routeModel('claude-3-opus', 'Summarize this text')).toBe('claude-3-haiku');
  });

  test('claude-opus-4.6 应降级为 claude-haiku-4.5', () => {
    expect(routing.routeModel('claude-opus-4.6', 'List the main topics')).toBe('claude-haiku-4.5');
  });

  test('gpt-4.1 分类应降级为 gpt-4.1-mini', () => {
    expect(routing.routeModel('gpt-4.1', 'Categorize these items')).toBe('gpt-4.1-mini');
  });

  test('禁用后路由应返回原始模型', () => {
    routing.setOptions({ enabled: false });
    expect(routing.routeModel('gpt-4', 'Simple task')).toBe('gpt-4');
  });

  test('中文分析任务应检测为 complex', () => {
    expect(routing.detectComplexity('请分析这段代码的性能问题')).toBe('complex');
  });

  test('中文总结任务应检测为 classification', () => {
    expect(routing.detectComplexity('请总结这篇文章的主要内容')).toBe('classification');
  });

  test('中文提取任务应检测为 extraction', () => {
    expect(routing.detectComplexity('请从文本中提取所有日期信息')).toBe('extraction');
  });

  test('长 prompt 应增加 complexScore', () => {
    const longPrompt = '这是一段很长的文本'.repeat(80);
    expect(routing.detectComplexity(longPrompt)).toBe('complex');
  });

  test('中文任务应正确路由降级', () => {
    expect(routing.routeModel('gpt-4', '请分类这些邮件')).toBe('gpt-4o-mini');
  });

  test('中文复杂任务应保持原模型', () => {
    expect(routing.routeModel('gpt-4', '请分析这个算法的时间复杂度并优化')).toBe('gpt-4');
  });

  test('重复关键词不应虚增复杂度分数', () => {
    // "analyze" 出现多次，应与单次出现结果相同（布尔命中）
    const single = routing.detectComplexity('Please analyze this data');
    const repeated = routing.detectComplexity('analyze, then analyze, then analyze again');
    expect(single).toBe(repeated);
  });

  test('classification 应降级到 simple（降级链）', () => {
    // claude-3-opus 有 classification 规则降级到 claude-3-haiku
    // 但如果没有 classification 规则，应尝试 simple
    expect(routing.routeModel('claude-3-opus', 'Translate this text')).toBe('claude-3-haiku');
  });

  test('simple+complex 关键词平局时应偏向 complex（不降级）', () => {
    // 同时包含 classify（simple）和 analyze（complex），应检测为 complex
    expect(routing.detectComplexity('Classify and analyze this data')).toBe('complex');
  });

  test('simple+extraction 关键词平局时应偏向 extraction', () => {
    // 同时包含 classify（simple）和 extract（extraction），应检测为 extraction
    expect(routing.detectComplexity('Classify and extract key entities')).toBe('extraction');
  });

  test('simple+complex 平局时路由不应降级', () => {
    // 同时含 simple 和 complex 关键词 → complex → 无 complex 路由规则 → 保持原模型
    expect(routing.routeModel('gpt-4', 'Classify and analyze this data')).toBe('gpt-4');
  });

  test('空 prompt 应保持原模型', () => {
    expect(routing.routeModel('gpt-4', '')).toBe('gpt-4');
  });

  test('空 model 应返回原 model', () => {
    expect(routing.routeModel('', 'Classify this')).toBe('');
  });

  test('o3 简单任务应降级为 o4-mini', () => {
    expect(routing.routeModel('o3', 'List the topics')).toBe('o4-mini');
  });

  test('claude-sonnet-4.6 简单任务应降级为 claude-haiku-4.5', () => {
    expect(routing.routeModel('claude-sonnet-4.6', 'Define the term')).toBe('claude-haiku-4.5');
  });

  test('无路由规则的模型应保持不变', () => {
    expect(routing.routeModel('gpt-4o-mini', 'Classify this')).toBe('gpt-4o-mini');
  });

  test('gpt-4-turbo 分类应降级为 gpt-4o-mini', () => {
    expect(routing.routeModel('gpt-4-turbo', 'Categorize these items')).toBe('gpt-4o-mini');
  });

  test('gpt-4-turbo 提取应降级为 gpt-4o-mini', () => {
    expect(routing.routeModel('gpt-4-turbo', 'Extract the names from this text')).toBe('gpt-4o-mini');
  });

  test('gpt-4-turbo 复杂任务应保持不变', () => {
    expect(routing.routeModel('gpt-4-turbo', 'Analyze and refactor this code')).toBe('gpt-4-turbo');
  });

  test('claude-3-sonnet 简单应降级为 claude-3-haiku', () => {
    expect(routing.routeModel('claude-3-sonnet', 'Summarize this article')).toBe('claude-3-haiku');
  });

  test('claude-3-sonnet 分类应降级为 claude-3-haiku', () => {
    expect(routing.routeModel('claude-3-sonnet', 'Classify this sentiment')).toBe('claude-3-haiku');
  });

  test('claude-3.5-sonnet 简单应降级为 claude-haiku-4.5', () => {
    expect(routing.routeModel('claude-3.5-sonnet', 'Summarize this article')).toBe('claude-haiku-4.5');
  });

  test('claude-3.5-sonnet 分类应降级为 claude-haiku-4.5', () => {
    expect(routing.routeModel('claude-3.5-sonnet', 'Classify this sentiment')).toBe('claude-haiku-4.5');
  });

  test('claude-3.7-sonnet 简单应降级为 claude-haiku-4.5', () => {
    expect(routing.routeModel('claude-3.7-sonnet', 'Summarize this article')).toBe('claude-haiku-4.5');
  });

  test('claude-3.7-sonnet 分类应降级为 claude-haiku-4.5', () => {
    expect(routing.routeModel('claude-3.7-sonnet', 'Classify this sentiment')).toBe('claude-haiku-4.5');
  });

  test('o1-preview 简单任务应降级为 o4-mini', () => {
    expect(routing.routeModel('o1-preview', 'Summarize this article')).toBe('o4-mini');
  });

  test('o1-preview 提取任务应降级为 o4-mini', () => {
    expect(routing.routeModel('o1-preview', 'Extract key entities from the text')).toBe('o4-mini');
  });

  test('o1-mini 简单任务应降级为 o4-mini', () => {
    expect(routing.routeModel('o1-mini', 'Translate this sentence')).toBe('o4-mini');
  });

  test('o1-mini 复杂任务应保持不变', () => {
    expect(routing.routeModel('o1-mini', 'Analyze and prove this theorem step by step')).toBe('o1-mini');
  });

  test('claude-sonnet-4 简单任务应降级为 claude-haiku-4.5', () => {
    expect(routing.routeModel('claude-sonnet-4', 'Summarize this article')).toBe('claude-haiku-4.5');
  });

  test('claude-opus-4 分类任务应降级为 claude-haiku-4.5', () => {
    expect(routing.routeModel('claude-opus-4', 'Classify this sentiment')).toBe('claude-haiku-4.5');
  });

  test('模型名大小写不敏感匹配', () => {
    expect(routing.routeModel('GPT-4', 'Summarize this article')).not.toBe('GPT-4');
    expect(routing.routeModel('Claude-3-Sonnet', 'Classify this text')).not.toBe('Claude-3-Sonnet');
  });

  test('极端长 prompt 不应导致性能问题', () => {
    const longPrompt = 'analyze this complex system '.repeat(5000);
    const start = Date.now();
    routing.routeModel('gpt-4', longPrompt);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100);
  });
});
