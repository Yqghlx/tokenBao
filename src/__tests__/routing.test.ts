import routing from '../optimizations/routing';

describe('routing 模块', () => {
  afterEach(() => {
    routing.setOptions({ enabled: true });
  });

  test('分类任务应检测为简单', () => {
    expect(routing.detectComplexity('Classify this text as positive or negative')).toBe('simple');
  });

  test('总结任务应检测为简单', () => {
    expect(routing.detectComplexity('Summarize this article in 3 sentences')).toBe('simple');
  });

  test('分析任务应检测为复杂', () => {
    expect(routing.detectComplexity('Analyze why this algorithm fails and suggest improvements')).toBe('complex');
  });

  test('设计任务应检测为复杂', () => {
    expect(routing.detectComplexity('Design a scalable architecture for this system')).toBe('complex');
  });

  test('简单任务应将 gpt-4 降级为 gpt-4o-mini', () => {
    expect(routing.routeModel('gpt-4', 'Classify this feedback')).toBe('gpt-4o-mini');
  });

  test('复杂任务应保持 gpt-4 不变', () => {
    expect(routing.routeModel('gpt-4', 'Design a new feature')).toBe('gpt-4');
  });

  test('简单任务应将 claude-3-opus 降级为 claude-3-haiku', () => {
    expect(routing.routeModel('claude-3-opus', 'Summarize this text')).toBe('claude-3-haiku');
  });

  test('禁用后路由应返回原始模型', () => {
    routing.setOptions({ enabled: false });
    expect(routing.routeModel('gpt-4', 'Simple task')).toBe('gpt-4');
  });
});
