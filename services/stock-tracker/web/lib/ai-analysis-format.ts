/**
 * AI 解析結果フォーマッタ
 *
 * 投資判断の予測リターン・確信度を表示用文字列に変換する純粋関数。
 * UI 層から呼び出される表示ロジックを lib に分離する。
 */

/**
 * 予測リターンを符号付き・小数2桁・% 形式の文字列にフォーマットする。
 *
 * @param value - 予測リターン (%)。任意の有限数を受け付ける
 * @returns フォーマットされた文字列（例: "+1.23%", "-0.40%", "+0.00%"）
 */
export function formatPredictedReturn(value: number): string {
  const formatted = Math.abs(value).toFixed(2);
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${formatted}%`;
}

/**
 * 確信度を整数パーセント形式の文字列にフォーマットする。
 *
 * [0,1] 外の値も破綻しない実装（クランプは呼び出し側で担保されている前提だが、
 * ここでは計算のみ行い範囲外でも数値を返す）。
 *
 * @param value - 確信度 (0〜1)。0.72 → "72%"
 * @returns フォーマットされた文字列（例: "72%", "0%", "100%"）
 */
export function formatConfidence(value: number): string {
  const percent = Math.round(value * 100);
  return `${percent}%`;
}
