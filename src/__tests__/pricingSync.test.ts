import { updateRemotePricing, getRemotePricingInfo, MODEL_PRICING, calculateCost, normalizeModelName, _resetRemotePricing } from '../proxy/pricing';
import * as pricingSync from '../services/pricingSync';

describe('定价远程同步', () => {
  afterEach(() => {
    pricingSync.stopSync();
    _resetRemotePricing();
  });

  describe('updateRemotePricing', () => {
    test('应更新合法的定价数据', () => {
      const originalPrice = MODEL_PRICING['gpt-4o'].input;
      const updated = updateRemotePricing({
        'gpt-4o': { input: 0.005, output: 0.015 }
      }, 'test', Date.now());

      expect(updated).toBe(1);
      expect(MODEL_PRICING['gpt-4o'].input).toBe(0.005);
      expect(MODEL_PRICING['gpt-4o'].output).toBe(0.015);

      // 恢复原始值
      MODEL_PRICING['gpt-4o'].input = originalPrice;
      MODEL_PRICING['gpt-4o'].output = 0.01;
    });

    test('应添加新模型定价', () => {
      const updated = updateRemotePricing({
        'gpt-5': { input: 0.01, output: 0.03 }
      }, 'test', Date.now());

      expect(updated).toBe(1);
      expect(MODEL_PRICING['gpt-5'].input).toBe(0.01);

      // 清理
      delete MODEL_PRICING['gpt-5'];
    });

    test('应跳过非法数据（负数价格）', () => {
      const updated = updateRemotePricing({
        'gpt-4o': { input: -0.01, output: 0.01 }
      }, 'test', Date.now());

      expect(updated).toBe(0);
    });

    test('应跳过非法数据（NaN）', () => {
      const updated = updateRemotePricing({
        'gpt-4o': { input: NaN, output: 0.01 }
      }, 'test', Date.now());

      expect(updated).toBe(0);
    });

    test('应跳过非法数据（Infinity）', () => {
      const updated = updateRemotePricing({
        'gpt-4o': { input: Infinity, output: 0.01 }
      }, 'test', Date.now());

      expect(updated).toBe(0);
    });

    test('应跳过结构不合法的条目', () => {
      const updated = updateRemotePricing({
        'gpt-4o': { input: 'not-a-number', output: 0.01 } as any,
        '': { input: 0.01, output: 0.01 },
        'valid-model': { input: 0.01, output: 0.02 }
      }, 'test', Date.now());

      // 只有 valid-model 合法
      expect(updated).toBe(1);
      expect(MODEL_PRICING['valid-model']).toBeDefined();

      // 清理
      delete MODEL_PRICING['valid-model'];
    });

    test('应批量更新多个模型', () => {
      const updated = updateRemotePricing({
        'gpt-4o': { input: 0.003, output: 0.012 },
        'claude-3.5-sonnet': { input: 0.004, output: 0.02 },
        'new-model': { input: 0.001, output: 0.002 }
      }, 'test', Date.now());

      expect(updated).toBe(3);

      // 清理
      delete MODEL_PRICING['new-model'];
      MODEL_PRICING['gpt-4o'] = { input: 0.0025, output: 0.01 };
      MODEL_PRICING['claude-3.5-sonnet'] = { input: 0.003, output: 0.015 };
    });

    test('更新后 calculateCost 应使用新定价', () => {
      updateRemotePricing({
        'gpt-4o': { input: 0.01, output: 0.04 }
      }, 'test', Date.now());

      const cost = calculateCost('gpt-4o', 1000, 1000);
      expect(cost).toBeCloseTo(0.01 + 0.04, 6);

      // 恢复
      MODEL_PRICING['gpt-4o'] = { input: 0.0025, output: 0.01 };
    });

    test('更新后新模型可被 normalizeModelName 匹配', () => {
      updateRemotePricing({
        'gpt-5-turbo': { input: 0.005, output: 0.02 }
      }, 'test', Date.now());

      expect(normalizeModelName('gpt-5-turbo-2026-01-01')).toBe('gpt-5-turbo');

      // 清理
      delete MODEL_PRICING['gpt-5-turbo'];
    });
  });

  describe('getRemotePricingInfo', () => {
    test('未同步时应返回空信息', () => {
      const info = getRemotePricingInfo();
      expect(info.timestamp).toBe(0);
      expect(info.source).toBe('');
    });

    test('同步后应返回来源信息', () => {
      const now = Date.now();
      updateRemotePricing({ 'gpt-4o': { input: 0.003, output: 0.012 } }, 'test-url', now);
      const info = getRemotePricingInfo();
      expect(info.timestamp).toBe(now);
      expect(info.source).toBe('test-url');

      // 恢复
      MODEL_PRICING['gpt-4o'] = { input: 0.0025, output: 0.01 };
    });
  });

  describe('getSyncStatus', () => {
    test('应返回同步状态', () => {
      const status = pricingSync.getSyncStatus();
      expect(typeof status.lastSync).toBe('number');
      expect(typeof status.source).toBe('string');
    });
  });

  describe('stopSync', () => {
    test('停止后不应报错', () => {
      expect(() => pricingSync.stopSync()).not.toThrow();
    });
  });

  describe('sync（网络请求）', () => {
    test('无效 URL 应返回 0 而不抛异常', async () => {
      const result = await pricingSync.sync('https://invalid.example.com/nonexistent-pricing.json');
      expect(result).toBe(0);
    }, 15000);
  });
});
