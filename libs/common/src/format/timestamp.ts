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
 * 日時をローカルタイムゾーンで "YYYY/MM/DD HH:MM:SS" にフォーマットする。
 * 引数を省略した場合は現在時刻を使用する。
 *
 * @example
 * formatLocalDateTime() // "2026/05/12 12:15:42"
 * formatLocalDateTime(new Date(2024, 0, 5, 1, 2, 3)) // "2024/01/05 01:02:03"
 */
export function formatLocalDateTime(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}
