import '@testing-library/jest-dom';
import { formatMoney } from '../utils/format';

describe('formatMoney', () => {
  test('正常正数格式化为指定小数位', () => {
    expect(formatMoney(1.2345, 2)).toBe('1.23');
    expect(formatMoney(1.2345, 4)).toBe('1.2345');
    expect(formatMoney(0.1, 2)).toBe('0.10');
  });

  test('零值格式化', () => {
    expect(formatMoney(0, 2)).toBe('0.00');
    expect(formatMoney(0, 4)).toBe('0.0000');
  });

  test('负数格式化', () => {
    expect(formatMoney(-1.5, 2)).toBe('-1.50');
  });

  test('NaN 返回零值格式', () => {
    expect(formatMoney(Number.NaN, 2)).toBe('0.00');
    expect(formatMoney(Number.NaN, 4)).toBe('0.0000');
  });

  test('Infinity 返回零值格式', () => {
    expect(formatMoney(Number.POSITIVE_INFINITY, 2)).toBe('0.00');
    expect(formatMoney(Number.NEGATIVE_INFINITY, 2)).toBe('0.00');
  });

  test('默认小数位为 2', () => {
    expect(formatMoney(1.5)).toBe('1.50');
  });

  test('整数正确格式化', () => {
    expect(formatMoney(100, 2)).toBe('100.00');
    expect(formatMoney(100, 0)).toBe('100');
  });

  test('超大数回退到 toLocaleString', () => {
    // 1e+21 的 toFixed 会返回科学计数法，触发回退逻辑
    const huge = 1e+21;
    const result = formatMoney(huge, 2);
    // toLocaleString 应该包含逗号分隔的数字
    expect(result).not.toContain('e');
    expect(result).not.toContain('E');
  });

  test('极小正数正确格式化', () => {
    expect(formatMoney(0.0001, 4)).toBe('0.0001');
  });
});
