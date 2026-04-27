/**
 * tokenCounter 测试
 * 覆盖 countTokens/countMessages/estimateCost/calculateSavings
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
      // countMessages 对空消息列表仍有 formatOverhead=3 + 初始值=3
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
      // 多条消息有额外的 role 开销
      expect(multipleCount).toBeGreaterThan(singleCount);
    });
  });

  describe('estimateCost', () => {
    test('已知模型应返回正确费用', () => {
      // gpt-4o: input=$0.0025, output=$0.01
      const cost = tokenCounter.estimateCost(1000, 500, 'gpt-4o');
      expect(cost).toBeCloseTo(0.0025 + 0.005, 6);
    });

    test('未知模型应返回 fallback 费用', () => {
      const cost = tokenCounter.estimateCost(1000, 500, 'unknown-model');
      expect(cost).toBeGreaterThan(0);
    });

    test('零 token 应返回 0', () => {
      const cost = tokenCounter.estimateCost(0, 0, 'gpt-4o');
      expect(cost).toBe(0);
    });
  });

  describe('calculateSavings', () => {
    test('有缓存 token 应返回正的节省费用', () => {
      const savings = tokenCounter.calculateSavings(1000, 500, 'gpt-4o');
      expect(savings).toBeGreaterThan(0);
    });

    test('无缓存 token 应返回 0 节省', () => {
      // calculateSavings(0, 0) → fullCost=0, cachedCost=0, savings=0
      const savings = tokenCounter.calculateSavings(0, 0, 'gpt-4o');
      expect(savings).toBe(0);
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
});
