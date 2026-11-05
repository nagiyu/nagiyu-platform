const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 月の回数の記録を、期間が終わったあとも残す余裕。
 * DynamoDB の TTL による削除は遅れることがあるため、削除を前提にした判定はしない。
 */
const MONTH_TTL_MARGIN_MS = 7 * DAY_MS;

const pad = (value: number, length: number): string => String(value).padStart(length, '0');

const toJstDate = (nowMs: number): Date => new Date(nowMs + JST_OFFSET_MS);

/** 日本時間の暦月のキー (例: 202611) */
export const toJstMonthKey = (nowMs: number): string => {
  const jst = toJstDate(nowMs);
  return `${pad(jst.getUTCFullYear(), 4)}${pad(jst.getUTCMonth() + 1, 2)}`;
};

/** 日本時間の暦日のキー (例: 20261105) */
export const toJstDayKey = (nowMs: number): string => {
  const jst = toJstDate(nowMs);
  return `${toJstMonthKey(nowMs)}${pad(jst.getUTCDate(), 2)}`;
};

/**
 * 月の回数の記録の TTL (エポック秒)。翌月末 + 余裕。
 *
 * 戻す処理は記録が残っている月に対してだけ行うため、翌月までは確実に残す。
 */
export const toMonthTtlSeconds = (nowMs: number): number => {
  const jst = toJstDate(nowMs);
  // 翌々月 1 日 0 時 (日本時間) = 翌月末
  const endOfNextMonthMs = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth() + 2, 1) - JST_OFFSET_MS;
  return Math.floor((endOfNextMonthMs + MONTH_TTL_MARGIN_MS) / 1000);
};

/**
 * 日ごとの記録 (塩・IP) の TTL (エポック秒)。その日の終わりの 1 日後。この時刻を過ぎると期限切れになるが、
 * DynamoDB の削除は遅れることがあるため、削除は期限の直後とは限らない。
 */
export const toDayTtlSeconds = (nowMs: number): number => {
  const jst = toJstDate(nowMs);
  const endOfDayMs =
    Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() + 1) - JST_OFFSET_MS;
  return Math.floor((endOfDayMs + DAY_MS) / 1000);
};
