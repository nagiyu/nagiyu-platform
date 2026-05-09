/**
 * 価格表示用の数値フォーマッタ。小数点第 2 位まで表示する。
 *
 * @example
 * formatPrice(120.5)  // "120.50"
 * formatPrice(120)    // "120.00"
 */
export function formatPrice(value: number): string {
  return value.toFixed(2);
}
