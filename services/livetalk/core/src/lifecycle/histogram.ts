import type { MessageEntity } from '../entities/message.entity.js';

/** 時間帯別カウント配列（インデックス = 0〜23 時）。 */
export type HourHistogram = number[];

function getLocalHour(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === 'hour');
  if (!hourPart) return 0;
  // "24" は翌日 0 時として返されることがある（Intl の実装差）
  return parseInt(hourPart.value, 10) % 24;
}

/**
 * メッセージの CreatedAt を指定タイムゾーンの時刻に変換し、
 * 時間帯ごとの出現カウントを 24 要素の配列で返す。
 */
export function buildHourlyHistogram(
  messages: MessageEntity[],
  timezone = 'Asia/Tokyo'
): HourHistogram {
  const histogram: HourHistogram = new Array(24).fill(0) as HourHistogram;
  for (const msg of messages) {
    const hour = getLocalHour(new Date(msg.CreatedAt), timezone);
    histogram[hour]++;
  }
  return histogram;
}

/**
 * `fromHour`〜`toHour` の範囲でピーク時間帯を返す（wrap-around 対応）。
 * `toHour` が 23 を超える場合は % 24 で折り返す（夜型ユーザー対応）。
 * 同票の場合は fromHour に近い時間帯を優先する。
 * 範囲内のカウントが全て 0 の場合は `null` を返す。
 *
 * @returns "HH:00" 形式、またはデータなしの場合 null
 */
export function findPeakInRange(
  histogram: HourHistogram,
  fromHour: number,
  toHour: number
): string | null {
  let peakHour = -1;
  let peakCount = 0;

  for (let h = fromHour; h <= toHour; h++) {
    const idx = h % 24;
    if (histogram[idx] > peakCount) {
      peakCount = histogram[idx];
      peakHour = idx;
    }
  }

  if (peakHour === -1) return null;
  return `${String(peakHour).padStart(2, '0')}:00`;
}
