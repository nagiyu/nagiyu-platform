/**
 * Stock Tracker Core - Price Calculator Service
 *
 * 目標価格を算出するビジネスロジック
 *
 * Phase 1 仕様:
 * - 固定倍率 1.2 を使用
 * - AveragePrice × 1.2 で目標価格を算出
 */

/**
 * エラーメッセージ定数
 */
export const PRICE_CALCULATOR_ERROR_MESSAGES = {
  INVALID_PRICE: '無効な価格です。価格は正の数値である必要があります',
} as const;

/**
 * 目標価格の算出
 *
 * Phase 1: 平均取得価格 × 1.2 で目標価格を算出
 *
 * @param averagePrice - 平均取得価格
 * @returns 目標価格（平均取得価格 × 1.2）
 * @throws Error - 無効な価格の場合
 *
 * @example
 * calculateTargetPrice(100.00) // => 120.00
 * calculateTargetPrice(250.50) // => 300.60
 * calculateTargetPrice(1000) // => 1200
 */
export function calculateTargetPrice(averagePrice: number): number {
  // 価格の妥当性チェック
  if (
    typeof averagePrice !== 'number' ||
    isNaN(averagePrice) ||
    averagePrice < 0 ||
    !isFinite(averagePrice)
  ) {
    throw new Error(PRICE_CALCULATOR_ERROR_MESSAGES.INVALID_PRICE);
  }

  // Phase 1: 固定倍率 1.2 を使用
  const targetPrice = averagePrice * 1.2;

  return targetPrice;
}
