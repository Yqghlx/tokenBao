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
});
