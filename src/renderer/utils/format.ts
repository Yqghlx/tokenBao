/**
 * 安全格式化金额，防止 NaN/Infinity/超大数导致 UI 崩溃
 */
export function formatMoney(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return (0).toFixed(digits);
  // 超大数 toFixed 返回科学计数法（如 "1e+21"），兜底为字符串截断显示
  const result = value.toFixed(digits);
  if (result.includes('e') || result.includes('E')) {
    return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  return result;
}
