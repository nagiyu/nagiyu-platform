const ERROR_MESSAGES = {
  INVALID_DATE: '無効な日時が指定されました',
} as const;

/**
 * ロケールの整形結果をそのまま返すと、ICU の版によって区切り文字や "24:00" 表記が揺れる。
 * そのため各要素だけを取り出し、書式は自前で組み立てる。
 */
const JST_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

type JstParts = Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>;

function getJstParts(value: number | Date): JstParts {
  const date = typeof value === 'number' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    throw new Error(ERROR_MESSAGES.INVALID_DATE);
  }

  const parts: Partial<JstParts> = {};
  for (const part of JST_FORMATTER.formatToParts(date)) {
    if (part.type in { year: 1, month: 1, day: 1, hour: 1, minute: 1, second: 1 }) {
      parts[part.type as keyof JstParts] = part.value;
    }
  }
  return parts as JstParts;
}

/**
 * 日時を JST (Asia/Tokyo) 固定で "YYYY/MM/DD HH:mm" に整形する。24 時間制で、各要素は 2 桁にゼロ埋めする。
 * 実行環境のタイムゾーンに依存しないため、サーバー描画とブラウザで表示がそろう。
 *
 * @param value エポックミリ秒または Date
 * @param options.seconds true の場合は秒まで "YYYY/MM/DD HH:mm:ss" で返す
 * @throws 無効な日時 (NaN など) が渡された場合
 *
 * @example
 * formatJstDateTime(Date.UTC(2026, 9, 5, 0, 3, 7)) // "2026/10/05 09:03"
 * formatJstDateTime(Date.UTC(2026, 9, 5, 0, 3, 7), { seconds: true }) // "2026/10/05 09:03:07"
 */
export function formatJstDateTime(
  value: number | Date,
  options: { seconds?: boolean } = {}
): string {
  const { year, month, day, hour, minute, second } = getJstParts(value);
  const base = `${year}/${month}/${day} ${hour}:${minute}`;
  return options.seconds ? `${base}:${second}` : base;
}

/**
 * 日時の日付部分を JST (Asia/Tokyo) 固定で "YYYY/MM/DD" に整形する。
 * 実行環境のタイムゾーンに依存しないため、サーバー描画とブラウザで表示がそろう。
 *
 * @param value エポックミリ秒または Date
 * @throws 無効な日時 (NaN など) が渡された場合
 *
 * @example
 * formatJstDate(Date.UTC(2026, 9, 5, 15, 0, 0)) // "2026/10/06"
 */
export function formatJstDate(value: number | Date): string {
  const { year, month, day } = getJstParts(value);
  return `${year}/${month}/${day}`;
}
