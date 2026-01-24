/**
 * @nagiyu/common - Validation Helpers
 *
 * 汎用バリデーションヘルパー関数
 * Stock Tracker実装を汎化して再利用可能にしたもの
 */

/**
 * 文字列が空でないかチェック
 *
 * @param value - 文字列
 * @returns 空でない場合は true
 */
export function isNonEmptyString(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * 数値が有効な範囲内かチェック
 *
 * @param value - 数値
 * @param min - 最小値（含む）
 * @param max - 最大値（含む）
 * @returns 有効な場合は true
 */
export function isValidNumber(value: number, min: number, max: number): boolean {
  // NaN と Infinity をチェック
  if (!Number.isFinite(value)) {
    return false;
  }

  return value >= min && value <= max;
}

/**
 * Unix タイムスタンプが有効かチェック
 *
 * @param timestamp - Unix タイムスタンプ (ミリ秒)
 * @returns 有効な場合は true
 */
export function isValidTimestamp(timestamp: number): boolean {
  // 負の値と0を拒否
  if (timestamp <= 0) {
    return false;
  }

  // 現在時刻 + 1日（86400000ミリ秒）以降を拒否
  const maxTimestamp = Date.now() + 86400000;
  if (timestamp > maxTimestamp) {
    return false;
  }

  return true;
}
