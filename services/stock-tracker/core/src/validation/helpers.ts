/**
 * Stock Tracker Core - Validation Helpers
 *
 * Stock Tracker 固有のバリデーション用ヘルパー関数
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
