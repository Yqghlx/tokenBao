import * as configService from '../services/config';
import { deleteJson } from '../utils/storage';

/**
 * config 服务测试
 * 覆盖 getConfig / setConfig / getAllConfig / resetConfig / getOptimizationConfig / setOptimizationConfig
 */

const CONFIG_FILE = 'config.json';

describe('config 服务', () => {
  // 每个测试前重置配置文件，确保测试隔离
  beforeEach(() => {
    deleteJson(CONFIG_FILE);
  });

  test('getConfig 应返回默认值', async () => {
    const port = await configService.getConfig('proxyPort');
    expect(port).toBe('3000');

    const days = await configService.getConfig('dataRetentionDays');
    expect(days).toBe('30');
  });

  test('getConfig 不存在的键应返回 undefined', async () => {
    const value = await configService.getConfig('nonExistentKey');
    expect(value).toBeUndefined();
  });

  test('setConfig 应正确写入并读取', async () => {
    await configService.setConfig('proxyPort', '8080');
    const value = await configService.getConfig('proxyPort');
    expect(value).toBe('8080');
  });

  test('setConfig 新键应被添加', async () => {
    await configService.setConfig('theme', 'dark');
    const value = await configService.getConfig('theme');
    expect(value).toBe('dark');
  });

  test('getAllConfig 应返回完整配置副本', async () => {
    await configService.setConfig('proxyPort', '4000');
    const all = await configService.getAllConfig();

    expect(all.proxyPort).toBe('4000');
    expect(all.dataRetentionDays).toBe('30');
    expect(all.cacheTTL).toBe('5min');

    // 验证返回的是副本，修改不影响原始数据
    all.proxyPort = '9999';
    const reloaded = await configService.getAllConfig();
    expect(reloaded.proxyPort).toBe('4000');
  });

  test('resetConfig 应恢复所有默认值', async () => {
    await configService.setConfig('proxyPort', '9999');
    await configService.setConfig('dataRetentionDays', '100');

    await configService.resetConfig();

    const port = await configService.getConfig('proxyPort');
    const days = await configService.getConfig('dataRetentionDays');
    const ttl = await configService.getConfig('cacheTTL');

    expect(port).toBe('3000');
    expect(days).toBe('30');
    expect(ttl).toBe('5min');
  });

  test('getOptimizationConfig 应返回默认优化配置', async () => {
    const optim = await configService.getOptimizationConfig();

    expect(optim.caching).toBe(true);
    expect(optim.compression).toBe(true);
    expect(optim.routing).toBe(true);
    expect(optim.batching).toBe(false);
  });

  test('setOptimizationConfig 应正确更新', async () => {
    await configService.setOptimizationConfig({ caching: false, routing: false });

    const optim = await configService.getOptimizationConfig();
    expect(optim.caching).toBe(false);
    expect(optim.routing).toBe(false);
    // 未修改的应保持原值
    expect(optim.compression).toBe(true);
  });

  test('setOptimizationConfig 应返回副本而非引用', async () => {
    const optim1 = await configService.getOptimizationConfig();
    optim1.caching = false; // 修改返回值

    const optim2 = await configService.getOptimizationConfig();
    expect(optim2.caching).toBe(true); // 原始数据不变
  });

  test('连续多次 setConfig 应保持一致性', async () => {
    for (let i = 0; i < 10; i++) {
      await configService.setConfig('proxyPort', String(3000 + i));
    }
    const value = await configService.getConfig('proxyPort');
    expect(value).toBe('3009');
  });

  test('resetConfig 后 optimization 也应恢复默认', async () => {
    await configService.setOptimizationConfig({ batching: true, caching: false });
    await configService.resetConfig();

    const optim = await configService.getOptimizationConfig();
    expect(optim.caching).toBe(true);
    expect(optim.batching).toBe(false);
  });

  describe('配置值验证', () => {
    test('proxyPort 无效值应被拒绝', async () => {
      await expect(configService.setConfig('proxyPort', '80')).rejects.toThrow('配置值无效');
      await expect(configService.setConfig('proxyPort', 'abc')).rejects.toThrow('配置值无效');
      await expect(configService.setConfig('proxyPort', '99999')).rejects.toThrow('配置值无效');
    });

    test('proxyPort 有效值应被接受', async () => {
      await expect(configService.setConfig('proxyPort', '8080')).resolves.toBeUndefined();
      await expect(configService.setConfig('proxyPort', '3000')).resolves.toBeUndefined();
    });

    test('dataRetentionDays 无效值应被拒绝', async () => {
      await expect(configService.setConfig('dataRetentionDays', '0')).rejects.toThrow('配置值无效');
      await expect(configService.setConfig('dataRetentionDays', '500')).rejects.toThrow('配置值无效');
    });

    test('dataRetentionDays 有效值应被接受', async () => {
      await expect(configService.setConfig('dataRetentionDays', '30')).resolves.toBeUndefined();
      await expect(configService.setConfig('dataRetentionDays', '1')).resolves.toBeUndefined();
    });

    test('cacheTTL 无效值应被拒绝', async () => {
      await expect(configService.setConfig('cacheTTL', '10min')).rejects.toThrow('配置值无效');
    });

    test('theme 无效值应被拒绝', async () => {
      await expect(configService.setConfig('theme', 'blue')).rejects.toThrow('配置值无效');
    });

    test('未知配置键应被拒绝', async () => {
      await expect(configService.setConfig('customKey', 'anyValue')).rejects.toThrow('未知的配置项');
    });

    test('proxyPort 非纯数字应被拒绝', async () => {
      await expect(configService.setConfig('proxyPort', '8080abc')).rejects.toThrow('配置值无效');
      await expect(configService.setConfig('proxyPort', '12.5')).rejects.toThrow('配置值无效');
    });

    test('dataRetentionDays 非纯数字应被拒绝', async () => {
      await expect(configService.setConfig('dataRetentionDays', '30days')).rejects.toThrow('配置值无效');
    });
  });
});
