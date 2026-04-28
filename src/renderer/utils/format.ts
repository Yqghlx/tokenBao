/**
 * 安全格式化金额，防止 NaN/Infinity 导致 UI 崩溃
 */
export function formatMoney(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return (0).toFixed(digits);
  return value.toFixed(digits);
}

/**
 * 安全格式化数字（千分位），防止 NaN/Infinity
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString();
}
