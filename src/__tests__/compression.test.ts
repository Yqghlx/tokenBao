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
});
