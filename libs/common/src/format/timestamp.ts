/**
 * 現在時刻を ISO 8601 形式（UTC）で取得する。
 *
 * @example
 * getTimestamp() // "2026-05-12T03:15:42.123Z"
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * 日付をローカルタイムゾーンで "YYYY-MM-DD" にフォーマットする。
 * ローカル時刻の getter で読むため、UTC 基準の日付を渡す場合は呼び出し側で扱いを決めること。
 *
 * @example
 * formatLocalDate(new Date(2024, 0, 5, 1, 2, 3)) // "2024-01-05"
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
