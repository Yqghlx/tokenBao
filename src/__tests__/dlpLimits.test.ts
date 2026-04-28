/**
 * DLP 替换上限测试
 * 验证 MAX_REPLACE_PER_RULE 超限行为和警告日志
 */

import dlpModule from '../optimizations/dlp';

// 启用 DLP
beforeEach(() => {
  dlpModule.setOptions({ enabled: true });
});

afterEach(() => {
  dlpModule.setOptions({ enabled: false });
});

describe('DLP MAX_REPLACE_PER_RULE', () => {
  it('正常数量的手机号全部脱敏', () => {
    // 生成 50 个手机号
    const phones = Array.from({ length: 50 }, (_, i) =>
      `1380000${String(i).padStart(4, '0')}`
    ).join(' ');

    const result = dlpModule.scan(phones);
    expect(result.modified).toBe(true);
    // 每个手机号被脱敏为 138****XXXX 格式
    expect(result.detections.some(d => d.ruleId === 'cn_phone')).toBe(true);
  });

  it('超过 100 个匹配时跳过后续替换并记录警告', () => {
    // 生成 120 个手机号，超过 MAX_REPLACE_PER_RULE=100
    const phones = Array.from({ length: 120 }, (_, i) =>
      `1390000${String(i).padStart(4, '0')}`
    ).join(' ');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = dlpModule.scan(phones);
    expect(result.modified).toBe(true);

    // 检测到规则触发
    const phoneDetection = result.detections.find(d => d.ruleId === 'cn_phone');
    expect(phoneDetection).toBeDefined();
    // 计数被截断到 100
    expect(phoneDetection!.count).toBe(100);

    // 应该输出超限警告（单个字符串参数）
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('cn_phone')
    );
    expect(warnSpy.mock.calls[0][0]).toContain('100');

    warnSpy.mockRestore();
  });

  it('未超过上限时不输出警告', () => {
    const text = '13700001234 13700002345 13700003456 13700004567 13700005678';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    dlpModule.scan(text);

    // 不应输出替换超限警告
    const limitWarnings = warnSpy.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('替换次数超过')
    );
    expect(limitWarnings).toHaveLength(0);

    warnSpy.mockRestore();
  });
});
