/**
 * パーセンテージ計算ヘルパー関数
 *
 * パーセンテージから目標価格を計算する機能を提供
 */

// エラーメッセージ定数
export const PERCENTAGE_ERROR_MESSAGES = {
  INVALID_BASE_PRICE: '基準価格は0より大きい値である必要があります',
  INVALID_PERCENTAGE: 'パーセンテージは-100以上の値である必要があります',
} as const;

/**
 * パーセンテージから目標価格を計算
 *
 * @param basePrice - 基準価格（保有株の平均取得価格など）
 * @param percentage - 選択されたパーセンテージ（-20 ～ +20）
 * @returns 計算された目標価格（小数点第2位まで）
 * @throws {Error} 不正な基準価格またはパーセンテージの場合
 *
 * @example
 * calculateTargetPriceFromPercentage(100, 20) // 120.00
 * calculateTargetPriceFromPercentage(100, -10) // 90.00
 * calculateTargetPriceFromPercentage(100, 0) // 100.00
 */
export function calculateTargetPriceFromPercentage(
  basePrice: number,
  percentage: number
): number {
  // バリデーション: 基準価格は0より大きい必要がある
  if (basePrice <= 0 || !Number.isFinite(basePrice)) {
    throw new Error(PERCENTAGE_ERROR_MESSAGES.INVALID_BASE_PRICE);
  }

  // バリデーション: パーセンテージは-100以上である必要がある（-100%未満だと負の値になる）
  if (!Number.isFinite(percentage) || percentage < -100) {
    throw new Error(PERCENTAGE_ERROR_MESSAGES.INVALID_PERCENTAGE);
  }

  // 計算: 目標価格 = 基準価格 × (1 + パーセンテージ / 100)
  const targetPrice = basePrice * (1 + percentage / 100);

  // 小数点第2位まで四捨五入して返す
  return Math.round(targetPrice * 100) / 100;
}

/**
 * 計算結果をフォーマットして文字列に変換
 *
 * @param value - 数値
 * @returns 小数点第2位までフォーマットした文字列
 *
 * @example
 * formatPrice(120.5) // "120.50"
 * formatPrice(120) // "120.00"
 */
export function formatPrice(value: number): string {
  return value.toFixed(2);
}
