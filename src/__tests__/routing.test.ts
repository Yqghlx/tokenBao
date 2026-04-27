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

  test('无关键词应检测为 simple', () => {
    expect(routing.detectComplexity('Hello world')).toBe('simple');
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
});
