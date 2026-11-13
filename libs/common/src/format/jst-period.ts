const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 月ごとの記録を、期間が終わったあとも残す余裕。
 * DynamoDB の TTL による削除は遅れることがあるため、削除を前提にした判定はしない。
 */
const MONTH_TTL_MARGIN_MS = 7 * DAY_MS;

const pad = (value: number, length: number): string => String(value).padStart(length, '0');

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// 日本時間に夏時間がないため、固定のずれで換算できる。Date のローカル時刻機能は実行環境の
// タイムゾーンに依存するので使わず、UTC の暦で計算する。
const toJstDate = (nowMs: number): Date => new Date(nowMs + JST_OFFSET_MS);

/**
 * その時刻を含む日本時間の日の始まり (00:00:00.000) の Unix ミリ秒。
 * 日の境界は UTC では 15:00 にあたる。
 */
export const toJstDayStartMs = (nowMs: number): number =>
  Math.floor((nowMs + JST_OFFSET_MS) / DAY_MS) * DAY_MS - JST_OFFSET_MS;

/** その時刻を含む日本時間の日の終わり (23:59:59.999) の Unix ミリ秒 */
export const toJstDayEndMs = (nowMs: number): number => toJstDayStartMs(nowMs) + DAY_MS - 1;

/** 日本時間の日付 (`YYYY-MM-DD`) */
export const toJstDateString = (nowMs: number): string => {
  const jst = toJstDate(nowMs);
  return `${pad(jst.getUTCFullYear(), 4)}-${pad(jst.getUTCMonth() + 1, 2)}-${pad(jst.getUTCDate(), 2)}`;
};

/**
 * `YYYY-MM-DD` を、その日の始まり (日本時間 0 時) の Unix ミリ秒にする。
 *
 * @returns 変換結果。形式違いや、2 月 30 日のように実在しない日付は null
 */
export const parseJstDateString = (date: string): number | null => {
  const match = DATE_PATTERN.exec(date);
  if (!match) {
    return null;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const midnightUtc = Date.UTC(year, month - 1, day);
  // Date.UTC は範囲外の日を繰り上げる。往復して同じ日付に戻らないものを弾く
  const roundTrip = new Date(midnightUtc);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    return null;
  }
  return midnightUtc - JST_OFFSET_MS;
};

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
 * 月ごとの記録の TTL (エポック秒)。翌月末 + 余裕。
 *
 * 前の月の記録を参照・更新する処理が残るため、翌月までは確実に残す。
 */
export const toMonthTtlSeconds = (nowMs: number): number => {
  const jst = toJstDate(nowMs);
  // 翌々月 1 日 0 時 (日本時間) = 翌月末
  const endOfNextMonthMs = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth() + 2, 1) - JST_OFFSET_MS;
  return Math.floor((endOfNextMonthMs + MONTH_TTL_MARGIN_MS) / 1000);
};

/**
 * 日ごとの記録の TTL (エポック秒)。その日の終わりの 1 日後。この時刻を過ぎると期限切れになるが、
 * DynamoDB の削除は遅れることがあるため、削除は期限の直後とは限らない。
 */
export const toDayTtlSeconds = (nowMs: number): number =>
  Math.floor((toJstDayEndMs(nowMs) + 1 + DAY_MS) / 1000);
