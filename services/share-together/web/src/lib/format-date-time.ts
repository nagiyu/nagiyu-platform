/**
 * エポックミリ秒を JST の「年/月/日 時:分」に整形する (例: 2026/10/17 11:49)。
 *
 * 実行環境のタイムゾーンに依存すると、サーバーとブラウザで表示がずれるため JST に固定する。
 *
 * @param epochMs - エポックミリ秒
 */
export function formatDateTimeJst(epochMs: number): string {
  return new Date(epochMs).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
