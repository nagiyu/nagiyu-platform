/**
 * エラー詳細のクエリパラメータ `at` (発生時刻) の解釈
 */

const EPOCH_MILLIS_PATTERN = /^\d+$/;

/**
 * `at` を epoch ミリ秒にする。
 *
 * 現行のリンクは数値のミリ秒だが、ミリ秒化の前に発行された通知やブックマークは
 * ISO 文字列を持つため、数値でなければ ISO として解釈して旧リンクを生かす。
 *
 * @returns epoch ミリ秒。解釈できなければ null
 */
export function parseOccurredAtParam(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const millis = EPOCH_MILLIS_PATTERN.test(value) ? Number(value) : Date.parse(value);
  return Number.isNaN(millis) ? null : millis;
}
