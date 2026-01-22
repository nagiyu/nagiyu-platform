/**
 * Stock Tracker Core - Validation Helpers
 *
 * 入力データのバリデーション用ヘルパー関数
 */

/**
 * 価格が有効な範囲内かチェック
 * @param price - 価格
 * @returns 有効な場合は true
 */
export function isValidPrice(price: number): boolean {
  return price >= 0.01 && price <= 1_000_000;
}

/**
 * 数量が有効な範囲内かチェック
 * @param quantity - 数量
 * @returns 有効な場合は true
 */
export function isValidQuantity(quantity: number): boolean {
  return quantity >= 0.0001 && quantity <= 1_000_000_000;
}

/**
 * 文字列が空でないかチェック
 * @param value - 文字列
 * @returns 空でない場合は true
 */
export function isNonEmptyString(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * Unix タイムスタンプが有効かチェック
 * @param timestamp - Unix タイムスタンプ (ミリ秒)
 * @returns 有効な場合は true
 */
export function isValidTimestamp(timestamp: number): boolean {
  return timestamp > 0 && timestamp <= Date.now() + 86400000; // 現在時刻 + 1日まで許容
}
