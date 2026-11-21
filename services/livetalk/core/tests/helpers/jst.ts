/**
 * 日本時間の暦で Date を組むテスト用ヘルパー。
 * 実行環境のタイムゾーンに依らず同じ時刻になる。month は 0 始まり (Date.UTC と同じ)。
 */
export function jst(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  return new Date(Date.UTC(year, month, day, hour - 9, minute, second));
}
