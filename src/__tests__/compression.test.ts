import compression from '../optimizations/compression';

describe('compression 模块', () => {
  afterEach(() => {
    compression.setOptions({ enabled: true });
  });

  test('压缩应移除 "please"', () => {
    const result = compression.compress('Please help me with this task');
    expect(result.text).not.toContain('Please');
    expect(result.tokensSaved).toBeGreaterThan(0);
  });

  test('压缩应移除 "Could you"', () => {
    const result = compression.compress('Could you please analyze this data');
    expect(result.text).not.toContain('Could you');
  });

  test('压缩应替换 "in JSON format" 为缩写', () => {
    const result = compression.compress('Return response in JSON format');
    expect(result.text).toContain('resp: JSON');
  });

  test('压缩应处理空字符串', () => {
    const result = compression.compress('');
    expect(result.text).toBe('');
    expect(result.tokensSaved).toBe(0);
  });

  test('compressPrompt 应处理数组格式', () => {
    const prompt = [
      { type: 'text', text: 'Please help me' },
      { type: 'image', data: 'base64...' }
    ];
    const result = compression.compressPrompt(prompt);
    const blocks = result as Array<{ type: string; text?: string; data?: string }>;
    expect(blocks[0].text).not.toContain('Please');
    expect(blocks[1].type).toBe('image');
  });

  test('禁用后压缩应不生效', () => {
    compression.setOptions({ enabled: false });
    const result = compression.compress('Please help me');
    expect(result.text).toBe('Please help me');
    expect(result.tokensSaved).toBe(0);
  });

  test('压缩应保护 fenced code blocks 不被破坏', () => {
    const input = 'Please help with this:\n```python\ndef  hello():\n    return 42\n```\nThat is all.';
    const result = compression.compress(input);
    // 代码块内的缩进和格式应保留
    expect(result.text).toContain('def  hello():');
    expect(result.text).toContain('    return 42');
  });

  test('压缩应保护波浪线围栏代码块', () => {
    const input = 'Please see:\n~~~json\n{  "key":  "value"  }\n~~~\nDone.';
    const result = compression.compress(input);
    expect(result.text).toContain('{  "key":  "value"  }');
  });

  test('代码块外的内容应正常压缩', () => {
    const input = 'Could you please help?\n```js\nconst x = 1;\n```\nThank you.';
    const result = compression.compress(input);
    expect(result.text).not.toContain('Could you');
    expect(result.text).toContain('const x = 1;');
  });

  test('压缩应替换 "in order to" 为 "to"', () => {
    const result = compression.compress('In order to succeed, you must try');
    expect(result.text).not.toContain('in order to');
    expect(result.text).toContain('to');
  });

  test('压缩应替换 "make sure to" 为 "ensure"', () => {
    const result = compression.compress('Make sure to check all inputs');
    expect(result.text).toContain('ensure');
    expect(result.text).not.toContain('make sure to');
  });

  test('压缩应替换 "as well as" 为 "&"', () => {
    const result = compression.compress('Please include headers as well as footers');
    expect(result.text).toContain('&');
    expect(result.text).not.toContain('as well as');
  });

  test('压缩应替换 "for the purpose of" 为 "to"', () => {
    const result = compression.compress('For the purpose of testing, we run this');
    expect(result.text).not.toContain('for the purpose of');
    expect(result.text).toContain('to');
  });

  test('压缩应替换 "at this point in time" 为 "now"', () => {
    const result = compression.compress('At this point in time, we cannot proceed');
    expect(result.text).toContain('now');
    expect(result.text).not.toContain('at this point in time');
  });

  test('压缩应替换 "in the event that" 为 "if"', () => {
    const result = compression.compress('In the event that it rains, stay inside');
    expect(result.text).toContain('if');
    expect(result.text).not.toContain('in the event that');
  });

  test('压缩应替换 "a large number of" 为 "many"', () => {
    const result = compression.compress('A large number of users reported this');
    expect(result.text).toContain('many');
    expect(result.text).not.toContain('a large number of');
  });

  test('压缩应替换 "and so on" 为 "etc"', () => {
    const result = compression.compress('Please include apples, bananas, and so on');
    expect(result.text).toContain('etc');
    expect(result.text).not.toContain('and so on');
  });

  test('压缩应替换 "for example" 为 "e.g."', () => {
    const result = compression.compress('For example, consider this case');
    expect(result.text).toContain('e.g.');
    expect(result.text).not.toContain('for example');
  });

  test('压缩应替换 "that is to say" 为 "i.e."', () => {
    const result = compression.compress('That is to say, the result is correct');
    expect(result.text).toContain('i.e.');
    expect(result.text).not.toContain('that is to say');
  });

  test('压缩应替换 "field name is string type" 为缩写', () => {
    const result = compression.compress('The field name is string type and required');
    expect(result.text).toContain('name: str');
  });

  test('compressPrompt 应处理字符串输入', () => {
    const result = compression.compressPrompt('Please help me with this');
    expect(typeof result).toBe('string');
    expect((result as string)).not.toContain('Please');
  });

  test('compressPrompt 空输入应原样返回', () => {
    expect(compression.compressPrompt('')).toBe('');
    expect(compression.compressPrompt(null as any)).toBeNull();
  });

  test('多条规则应同时生效', () => {
    const input = 'In order to proceed, please make sure to include data in JSON format';
    const result = compression.compress(input);
    expect(result.text).not.toContain('in order to');
    expect(result.text).not.toContain('please');
    expect(result.text).toContain('resp: JSON');
  });

  test('压缩应保留段落结构（空白顺序修复验证）', () => {
    const input = 'Paragraph 1\n\n\nParagraph 2\n\n\n\nParagraph 3';
    const result = compression.compress(input);
    // 多个连续空行应被合并为双换行（保留段落分隔）
    expect(result.text).toContain('\n\n');
    // 不应将所有内容合并为单行
    expect(result.text.split('\n').length).toBeGreaterThanOrEqual(3);
  });
});
