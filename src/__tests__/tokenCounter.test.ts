/**
 * tokenCounter 测试
 * 覆盖 countTokens/countMessages/countTokensOpenAI/countTokensAnthropic
 */

import tokenCounter from '../utils/tokenCounter';

describe('tokenCounter', () => {
  describe('countTokens', () => {
    test('空字符串应返回 0', () => {
      expect(tokenCounter.countTokens('')).toBe(0);
    });

    test('英文文本应返回正数', () => {
      const count = tokenCounter.countTokens('Hello, how are you today?');
      expect(count).toBeGreaterThan(0);
    });

    test('中文文本应返回正数', () => {
      const count = tokenCounter.countTokens('你好，今天天气怎么样？');
      expect(count).toBeGreaterThan(0);
    });

    test('API 类型 openai 应使用 tiktoken', () => {
      const count = tokenCounter.countTokens('Hello world', 'openai');
      expect(count).toBeGreaterThan(0);
    });

    test('API 类型 anthropic 应使用估算', () => {
      const count = tokenCounter.countTokens('Hello world', 'anthropic');
      expect(count).toBeGreaterThan(0);
    });

    test('长文本 token 数应多于短文本', () => {
      const short = tokenCounter.countTokens('Hi');
      const long = tokenCounter.countTokens('This is a much longer sentence with many more words.');
      expect(long).toBeGreaterThan(short);
    });
  });

  describe('countMessages', () => {
    test('空数组应返回初始开销（3 tokens）', () => {
      expect(tokenCounter.countMessages([])).toBe(3);
    });

    test('非数组应返回 0', () => {
      expect(tokenCounter.countMessages(null as any)).toBe(0);
      expect(tokenCounter.countMessages(undefined as any)).toBe(0);
    });

    test('字符串消息应返回正数', () => {
      const messages = [
        { content: 'Hello' },
        { content: 'World' }
      ];
      const count = tokenCounter.countMessages(messages);
      expect(count).toBeGreaterThan(0);
    });

    test('数组内容块消息应正确计算', () => {
      const messages = [
        { content: [{ type: 'text', text: 'Hello world' }] }
      ];
      const count = tokenCounter.countMessages(messages);
      expect(count).toBeGreaterThan(0);
    });

    test('包含图片块应增加 85 tokens', () => {
      const textOnly = [
        { content: [{ type: 'text', text: 'Hello' }] }
      ];
      const withImage = [
        { content: [{ type: 'text', text: 'Hello' }, { type: 'image' }] }
      ];
      const diff = tokenCounter.countMessages(withImage) - tokenCounter.countMessages(textOnly);
      expect(diff).toBe(85);
    });

    test('多条消息应包含格式开销', () => {
      const single = [{ content: 'Hello' }];
      const multiple = [{ content: 'Hello' }, { content: 'World' }];
      const singleCount = tokenCounter.countMessages(single);
      const multipleCount = tokenCounter.countMessages(multiple);
      expect(multipleCount).toBeGreaterThan(singleCount);
    });
  });

  describe('countTokensOpenAI', () => {
    test('应使用 tiktoken 编码', () => {
      const count = tokenCounter.countTokensOpenAI('Hello, world!');
      expect(count).toBeGreaterThan(0);
      // tiktoken 对 "Hello, world!" 的精确计数约为 4
      expect(count).toBeLessThanOrEqual(10);
    });

    test('空字符串应返回 0', () => {
      expect(tokenCounter.countTokensOpenAI('')).toBe(0);
    });
  });

  describe('image token 估算', () => {
    test('Anthropic image 类型应估算为 85 tokens', () => {
      const messages = [{
        content: [{ type: 'image' }, { type: 'text', text: '描述这张图' }]
      }];
      const count = tokenCounter.countMessages(messages, 'anthropic');
      // 85 (image) + 描述这张图 tokens + 格式开销 > 85
      expect(count).toBeGreaterThan(85);
    });

    test('OpenAI image_url 类型应估算为 85 tokens', () => {
      const messages = [{
        content: [
          { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
          { type: 'text', text: 'What is in this image?' }
        ]
      }];
      const count = tokenCounter.countMessages(messages, 'openai');
      // 85 (image) + 文本 tokens + 格式开销 > 85
      expect(count).toBeGreaterThan(85);
    });

    test('混合 text 和 image_url 应分别计算', () => {
      const textOnly = [{ content: 'Hello world' }];
      const withImage = [{
        content: [
          { type: 'text', text: 'Hello world' },
          { type: 'image_url', image_url: { url: 'https://example.com/img.png' } }
        ]
      }];
      const textOnlyCount = tokenCounter.countMessages(textOnly, 'openai');
      const withImageCount = tokenCounter.countMessages(withImage, 'openai');
      // 图片消息应比纯文本多约 85 tokens
      expect(withImageCount - textOnlyCount).toBeGreaterThanOrEqual(80);
    });

    test('Anthropic tool_use 应估算 input JSON token', () => {
      const textOnly = [{ content: 'Hello' }];
      const withTool = [{
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'tool_use', input: { query: 'search term', limit: 10 } }
        ]
      }];
      const textOnlyCount = tokenCounter.countMessages(textOnly, 'anthropic');
      const withToolCount = tokenCounter.countMessages(withTool, 'anthropic');
      expect(withToolCount).toBeGreaterThan(textOnlyCount);
    });

    test('Anthropic tool_result 字符串内容应估算 token', () => {
      const messages = [{
        content: [{ type: 'tool_result', content: 'The search returned 42 results' }]
      }];
      const count = tokenCounter.countMessages(messages, 'anthropic');
      expect(count).toBeGreaterThan(5);
    });

    test('Anthropic tool_result 嵌套内容块应估算 token', () => {
      const messages = [{
        content: [{
          type: 'tool_result',
          content: [{ type: 'text', text: 'Result data here' }]
        }]
      }];
      const count = tokenCounter.countMessages(messages, 'anthropic');
      expect(count).toBeGreaterThan(5);
    });

    test('OpenAI function calling 应估算 arguments token', () => {
      const textOnly = [{ content: 'Call the function' }];
      const withFunc = [{
        content: [
          { type: 'text', text: 'Call the function' },
          { type: 'function', function: { arguments: '{"query": "test", "limit": 5}' } }
        ]
      }];
      const textOnlyCount = tokenCounter.countMessages(textOnly, 'openai');
      const withFuncCount = tokenCounter.countMessages(withFunc, 'openai');
      expect(withFuncCount).toBeGreaterThan(textOnlyCount);
    });
  });

  describe('countTokensAnthropic', () => {
    test('应使用字符估算', () => {
      const count = tokenCounter.countTokensAnthropic('Hello, world!');
      expect(count).toBeGreaterThan(0);
    });

    test('空字符串应返回 0', () => {
      expect(tokenCounter.countTokensAnthropic('')).toBe(0);
    });

    test('中文应比等长英文消耗更多 token', () => {
      const english = tokenCounter.countTokensAnthropic('aaaaaaaaaaaa');
      const chinese = tokenCounter.countTokensAnthropic('你好你好你好你好');
      // 两者长度相同（12字符），但中文每 1.5 字符 1 token，英文每 3.5 字符 1 token
      expect(chinese).toBeGreaterThan(english);
    });
  });

  describe('cleanup', () => {
    test('cleanup 后重新计数应得到一致结果', () => {
      const before = tokenCounter.countTokens('cleanup test', 'openai');
      tokenCounter.cleanup();
      const after = tokenCounter.countTokens('cleanup test', 'openai');
      expect(after).toBe(before);
      expect(after).toBeGreaterThan(0);
    });

    test('多次 cleanup 不应报错', () => {
      tokenCounter.cleanup();
      tokenCounter.cleanup();
      const count = tokenCounter.countTokens('test', 'openai');
      expect(count).toBeGreaterThan(0);
    });
  });
});
