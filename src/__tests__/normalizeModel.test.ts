import { normalizeModelName, calculateCost, MODEL_PRICING } from '../proxy/pricing';

describe('normalizeModelName 模型名称归一化', () => {
  describe('别名精确匹配', () => {
    test('gpt-4-0613 应归一化为 gpt-4', () => {
      expect(normalizeModelName('gpt-4-0613')).toBe('gpt-4');
    });

    test('gpt-4-turbo-preview 应归一化为 gpt-4-turbo', () => {
      expect(normalizeModelName('gpt-4-turbo-preview')).toBe('gpt-4-turbo');
    });

    test('claude-3-opus-20240229 应归一化为 claude-3-opus', () => {
      expect(normalizeModelName('claude-3-opus-20240229')).toBe('claude-3-opus');
    });

    test('claude-3-5-sonnet-20241022 应归一化为 claude-3.5-sonnet', () => {
      expect(normalizeModelName('claude-3-5-sonnet-20241022')).toBe('claude-3.5-sonnet');
    });
  });

  describe('定价表直接命中', () => {
    test('gpt-4o 应直接命中定价表', () => {
      expect(normalizeModelName('gpt-4o')).toBe('gpt-4o');
    });

    test('claude-sonnet-4 应直接命中定价表', () => {
      expect(normalizeModelName('claude-sonnet-4')).toBe('claude-sonnet-4');
    });

    test('o3 应直接命中定价表', () => {
      expect(normalizeModelName('o3')).toBe('o3');
    });
  });

  describe('前缀匹配', () => {
    test('gpt-4o-2024-11-20 应通过别名匹配', () => {
      expect(normalizeModelName('gpt-4o-2024-11-20')).toBe('gpt-4o');
    });

    test('未知 gpt-4 变体应前缀匹配到 gpt-4', () => {
      expect(normalizeModelName('gpt-4-future-model')).toBe('gpt-4');
    });
  });

  describe('大小写不敏感', () => {
    test('GPT-4 应归一化为 gpt-4', () => {
      expect(normalizeModelName('GPT-4')).toBe('gpt-4');
    });

    test('Claude-3-Opus 应归一化为 claude-3-opus', () => {
      expect(normalizeModelName('Claude-3-Opus')).toBe('claude-3-opus');
    });
  });

  describe('未知模型', () => {
    test('空字符串应返回 unknown', () => {
      expect(normalizeModelName('')).toBe('unknown');
    });

    test('完全未知的模型应原样返回', () => {
      expect(normalizeModelName('my-custom-model')).toBe('my-custom-model');
    });
  });
});

describe('calculateCost 费用计算', () => {
  test('gpt-4o 1K 输入 + 1K 输出费用正确', () => {
    const cost = calculateCost('gpt-4o', 1000, 1000);
    expect(cost).toBeCloseTo(0.0025 + 0.01, 6);
  });

  test('未知模型应使用默认费率', () => {
    const cost = calculateCost('unknown-model', 1000, 1000);
    expect(cost).toBeCloseTo(0.001 + 0.002, 6);
  });

  test('0 token 应产生 0 费用', () => {
    const cost = calculateCost('gpt-4', 0, 0);
    expect(cost).toBe(0);
  });

  test('MODEL_PRICING 包含所有支持的模型', () => {
    const expectedModels = [
      'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini',
      'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
      'gpt-3.5-turbo', 'o3', 'o4-mini',
      'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku',
      'claude-3.5-sonnet', 'claude-3.5-haiku',
      'claude-sonnet-4', 'claude-opus-4'
    ];
    for (const model of expectedModels) {
      expect(model in MODEL_PRICING).toBe(true);
    }
  });
});
