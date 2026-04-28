/**
 * 安全格式化金额，防止 NaN/Infinity 导致 UI 崩溃
 */
export function formatMoney(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return (0).toFixed(digits);
  return value.toFixed(digits);
}
