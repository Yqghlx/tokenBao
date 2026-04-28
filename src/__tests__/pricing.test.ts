import { normalizeModelName, calculateCost, MODEL_PRICING } from '../proxy/pricing';

describe('pricing 定价模块', () => {
  describe('MODEL_PRICING 数据完整性', () => {
    test('所有模型定价应为正数', () => {
      for (const [, pricing] of Object.entries(MODEL_PRICING)) {
        expect(pricing.input).toBeGreaterThan(0);
        expect(pricing.output).toBeGreaterThan(0);
      }
    });

    test('输出价格不应低于输入价格', () => {
      for (const [, pricing] of Object.entries(MODEL_PRICING)) {
        expect(pricing.output).toBeGreaterThanOrEqual(pricing.input);
      }
    });

    test('应包含所有预期的模型（23 个）', () => {
      const expectedModels = [
        'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini',
        'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
        'gpt-3.5-turbo', 'o1-preview', 'o1-mini', 'o3', 'o4-mini',
        'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku',
        'claude-3.5-sonnet', 'claude-3.5-haiku',
        'claude-sonnet-4', 'claude-opus-4',
        'claude-opus-4.1', 'claude-sonnet-4.6', 'claude-opus-4.6',
        'claude-haiku-4.5'
      ];
      for (const model of expectedModels) {
        expect(model in MODEL_PRICING).toBe(true);
      }
    });

    test('模型总数应为 24', () => {
      expect(Object.keys(MODEL_PRICING).length).toBe(24);
    });
  });

  describe('normalizeModelName 新模型归一化', () => {
    test('gpt-4.1-2025-04-14 应归一化为 gpt-4.1', () => {
      expect(normalizeModelName('gpt-4.1-2025-04-14')).toBe('gpt-4.1');
    });

    test('gpt-4.1-mini-2025-04-14 应归一化为 gpt-4.1-mini', () => {
      expect(normalizeModelName('gpt-4.1-mini-2025-04-14')).toBe('gpt-4.1-mini');
    });

    test('gpt-4.1-nano-2025-04-14 应归一化为 gpt-4.1-nano', () => {
      expect(normalizeModelName('gpt-4.1-nano-2025-04-14')).toBe('gpt-4.1-nano');
    });

    test('o3-2025-04-16 应归一化为 o3', () => {
      expect(normalizeModelName('o3-2025-04-16')).toBe('o3');
    });

    test('o4-mini-2025-04-16 应归一化为 o4-mini', () => {
      expect(normalizeModelName('o4-mini-2025-04-16')).toBe('o4-mini');
    });

    test('claude-opus-4-1-20250414 应归一化为 claude-opus-4.1', () => {
      expect(normalizeModelName('claude-opus-4-1-20250414')).toBe('claude-opus-4.1');
    });

    test('claude-sonnet-4-6-20260401 应归一化为 claude-sonnet-4.6', () => {
      expect(normalizeModelName('claude-sonnet-4-6-20260401')).toBe('claude-sonnet-4.6');
    });

    test('claude-opus-4-6-20260401 应归一化为 claude-opus-4.6', () => {
      expect(normalizeModelName('claude-opus-4-6-20260401')).toBe('claude-opus-4.6');
    });

    test('claude-haiku-4-5-20251001 应归一化为 claude-haiku-4.5', () => {
      expect(normalizeModelName('claude-haiku-4-5-20251001')).toBe('claude-haiku-4.5');
    });

    test('o1-preview-2024-09-12 应归一化为 o1-preview', () => {
      expect(normalizeModelName('o1-preview-2024-09-12')).toBe('o1-preview');
    });

    test('o1-mini-2024-09-12 应归一化为 o1-mini', () => {
      expect(normalizeModelName('o1-mini-2024-09-12')).toBe('o1-mini');
    });

    test('前缀碰撞：gpt-4o-mini 不应被错误归一化为 gpt-4o', () => {
      // R39 回归测试：按长度降序匹配前缀，防止 gpt-4o 先于 gpt-4o-mini 匹配
      expect(normalizeModelName('gpt-4o-mini')).toBe('gpt-4o-mini');
      expect(normalizeModelName('gpt-4o-mini-2024-07-18')).toBe('gpt-4o-mini');
      // 确认不会被错误匹配到高价模型
      expect(normalizeModelName('gpt-4o-mini')).not.toBe('gpt-4o');
    });

    test('前缀碰撞：gpt-4.1-mini 不应被错误归一化为 gpt-4.1', () => {
      expect(normalizeModelName('gpt-4.1-mini-2025-04-14')).toBe('gpt-4.1-mini');
      expect(normalizeModelName('gpt-4.1-mini-2025-04-14')).not.toBe('gpt-4.1');
    });

    test('前缀碰撞：gpt-4.1-nano 不应被错误归一化为 gpt-4.1', () => {
      expect(normalizeModelName('gpt-4.1-nano-2025-04-14')).toBe('gpt-4.1-nano');
      expect(normalizeModelName('gpt-4.1-nano-2025-04-14')).not.toBe('gpt-4.1');
    });

    test('前缀碰撞：o4-mini 不应被错误归一化为 o3', () => {
      expect(normalizeModelName('o4-mini')).toBe('o4-mini');
      expect(normalizeModelName('o4-mini-2025-04-16')).toBe('o4-mini');
    });

    test('前缀碰撞：claude-opus-4.6 不应被错误归一化为 claude-opus-4', () => {
      expect(normalizeModelName('claude-opus-4-6-20260401')).toBe('claude-opus-4.6');
      expect(normalizeModelName('claude-opus-4-6-20260401')).not.toBe('claude-opus-4');
    });
  });

  describe('calculateCost 各模型费用', () => {
    test('gpt-4o 1K 输入 + 1K 输出', () => {
      const cost = calculateCost('gpt-4o', 1000, 1000);
      expect(cost).toBeCloseTo(0.0025 + 0.01, 6);
    });

    test('gpt-4.1 1K 输入 + 1K 输出', () => {
      const cost = calculateCost('gpt-4.1', 1000, 1000);
      expect(cost).toBeCloseTo(0.002 + 0.008, 6);
    });

    test('o3 1K 输入 + 1K 输出', () => {
      const cost = calculateCost('o3', 1000, 1000);
      expect(cost).toBeCloseTo(0.002 + 0.008, 6);
    });

    test('claude-opus-4.1 1K 输入 + 1K 输出', () => {
      const cost = calculateCost('claude-opus-4.1', 1000, 1000);
      expect(cost).toBeCloseTo(0.015 + 0.075, 6);
    });

    test('claude-sonnet-4.6 500 输入 + 200 输出', () => {
      const cost = calculateCost('claude-sonnet-4.6', 500, 200);
      expect(cost).toBeCloseTo(500 / 1000 * 0.003 + 200 / 1000 * 0.00375, 6);
    });

    test('claude-opus-4.6 通过别名计算费用', () => {
      const cost = calculateCost('claude-opus-4-6-20260401', 1000, 1000);
      expect(cost).toBeCloseTo(0.005 + 0.025, 6);
    });

    test('未知模型应使用默认费率', () => {
      const cost = calculateCost('unknown-model', 1000, 1000);
      expect(cost).toBeCloseTo(0.001 + 0.002, 6);
    });

    test('0 token 应产生 0 费用', () => {
      expect(calculateCost('gpt-4', 0, 0)).toBe(0);
    });

    test('负数 token 应视为 0', () => {
      expect(calculateCost('gpt-4', -100, -50)).toBe(0);
      expect(calculateCost('gpt-4', -100, 1000)).toBeCloseTo(0.06, 6);
    });

    test('NaN token 应视为 0', () => {
      expect(calculateCost('gpt-4', NaN, 1000)).toBeCloseTo(0.06, 6);
      expect(calculateCost('gpt-4', 1000, NaN)).toBeCloseTo(0.03, 6);
    });

    test('Infinity token 应视为 0', () => {
      expect(calculateCost('gpt-4', Infinity, 0)).toBe(0);
      expect(calculateCost('gpt-4', 0, Infinity)).toBe(0);
    });
  });
});
