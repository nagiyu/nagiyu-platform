/**
 * Stock Tracker Core - Trading Hours Checker Service
 *
 * 取引時間外に通知を抑制するロジック
 *
 * Phase 1 仕様:
 * - タイムゾーン変換 (date-fns-tz 使用)
 * - 取引時間帯チェック (Start/End)
 * - 曜日チェック (土日は通知抑制)
 * - 祝日は Phase 1 では考慮しない
 */

import { toZonedTime } from 'date-fns-tz';
import type { Exchange } from '../types.js';

/**
 * エラーメッセージ定数
 */
export const TRADING_HOURS_ERROR_MESSAGES = {
  INVALID_TIMEZONE: '無効なタイムゾーンです',
  INVALID_TIME_FORMAT: '無効な時刻形式です。HH:MM形式で指定してください',
  INVALID_CURRENT_TIME: '無効な現在時刻です',
} as const;

/**
 * HH:MM形式の時刻文字列をバリデーション
 *
 * @param timeString - 時刻文字列 (例: "09:30", "16:00")
 * @returns バリデーション結果
 */
function isValidTimeFormat(timeString: string): boolean {
  const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
  return timeRegex.test(timeString);
}

/**
 * HH:MM形式の時刻文字列を分・時に変換
 *
 * @param timeString - 時刻文字列 (例: "09:30")
 * @returns { hours: number, minutes: number }
 */
function parseTime(timeString: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeString.split(':').map(Number);
  return { hours, minutes };
}

/**
 * 取引時間内かどうかをチェック
 *
 * @param exchange - 取引所情報 (Timezone, Start, End)
 * @param currentTime - 現在時刻 (Unix timestamp またはDateオブジェクト)
 * @returns 取引時間内の場合は true、取引時間外の場合は false
 * @throws Error - 無効なタイムゾーン、時刻形式、現在時刻の場合
 *
 * @example
 * // NASDAQ (America/New_York, 04:00-20:00) での例
 * const nasdaq: Exchange = {
 *   ExchangeID: 'NASDAQ',
 *   Name: 'NASDAQ',
 *   Key: 'NSDQ',
 *   Timezone: 'America/New_York',
 *   Start: '04:00',
 *   End: '20:00',
 *   CreatedAt: Date.now(),
 *   UpdatedAt: Date.now(),
 * };
 *
 * // 平日の取引時間内
 * const tradingHours = new Date('2024-01-15T14:00:00Z'); // 月曜日 UTC 14:00 = EST 09:00
 * isTradingHours(nasdaq, tradingHours) // => true
 *
 * // 平日の取引時間外
 * const afterHours = new Date('2024-01-15T02:00:00Z'); // 月曜日 UTC 02:00 = EST 21:00
 * isTradingHours(nasdaq, afterHours) // => false
 *
 * // 土日
 * const weekend = new Date('2024-01-14T14:00:00Z'); // 日曜日
 * isTradingHours(nasdaq, weekend) // => false
 */
/**
 * Date オブジェクトを YYYY-MM-DD 形式にフォーマット
 */
function formatYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * YYYY-MM-DD の翌平日を返す
 */
function getNextWeekday(dateYmd: string): string {
  const base = new Date(`${dateYmd}T00:00:00Z`);
  let candidate = new Date(base.getTime() + 24 * 60 * 60 * 1000);
  while (candidate.getUTCDay() === 0 || candidate.getUTCDay() === 6) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }
  return formatYmd(candidate);
}

/**
 * 最新の取引日を返す
 *
 * 取引所のタイムゾーンと取引終了時刻をもとに、指定時刻時点での
 * 直近の取引完了日 (YYYY-MM-DD) を算出する。
 *
 * - 平日かつ取引終了後 (>= End) → 今日
 * - 平日かつ取引開始前 (< End)  → 前日の平日
 * - 土日                         → 直前の金曜
 *
 * @param exchange - 取引所情報 (Timezone, End)
 * @param now - 現在時刻 (Unix timestamp ms)
 * @returns 最新取引日 (YYYY-MM-DD、取引所タイムゾーン基準)
 */
export function getLastTradingDate(exchange: Exchange, now: number): string {
  const zonedNow = toZonedTime(new Date(now), exchange.Timezone);
  const endTime = parseTime(exchange.End);
  const endTotalMinutes = endTime.hours * 60 + endTime.minutes;
  const currentTotalMinutes = zonedNow.getHours() * 60 + zonedNow.getMinutes();
  const dayOfWeek = zonedNow.getDay();

  // 今日が平日かつ取引終了後 → 今日が最新取引日
  if (dayOfWeek !== 0 && dayOfWeek !== 6 && currentTotalMinutes >= endTotalMinutes) {
    return formatYmd(zonedNow);
  }

  // それ以外: 1日ずつ遡り最初の平日を返す (最大3回でFridayに到達)
  let candidateMs = now - 24 * 60 * 60 * 1000;
  while (true) {
    const candidate = toZonedTime(new Date(candidateMs), exchange.Timezone);
    const dow = candidate.getDay();
    if (dow !== 0 && dow !== 6) {
      return formatYmd(candidate);
    }
    candidateMs -= 24 * 60 * 60 * 1000;
  }
}

/**
 * 一時通知の期限取引日を算出する
 *
 * - 取引時間内: 当日を期限にする
 * - 取引時間外: 最新取引日の翌平日を期限にする
 */
export function calculateTemporaryExpireDate(exchange: Exchange, now: number): string {
  if (isTradingHours(exchange, now)) {
    return formatYmd(toZonedTime(new Date(now), exchange.Timezone));
  }
  const lastTradingDate = getLastTradingDate(exchange, now);
  return getNextWeekday(lastTradingDate);
}

export function isTradingHours(exchange: Exchange, currentTime: number | Date): boolean {
  // 現在時刻の妥当性チェック
  let currentDate: Date;
  if (typeof currentTime === 'number') {
    if (isNaN(currentTime) || currentTime < 0) {
      throw new Error(TRADING_HOURS_ERROR_MESSAGES.INVALID_CURRENT_TIME);
    }
    currentDate = new Date(currentTime);
  } else if (currentTime instanceof Date) {
    if (isNaN(currentTime.getTime())) {
      throw new Error(TRADING_HOURS_ERROR_MESSAGES.INVALID_CURRENT_TIME);
    }
    currentDate = currentTime;
  } else {
    throw new Error(TRADING_HOURS_ERROR_MESSAGES.INVALID_CURRENT_TIME);
  }

  // 時刻形式のバリデーション
  if (!isValidTimeFormat(exchange.Start)) {
    throw new Error(TRADING_HOURS_ERROR_MESSAGES.INVALID_TIME_FORMAT);
  }
  if (!isValidTimeFormat(exchange.End)) {
    throw new Error(TRADING_HOURS_ERROR_MESSAGES.INVALID_TIME_FORMAT);
  }

  // タイムゾーン変換
  let zonedDate: Date;
  try {
    zonedDate = toZonedTime(currentDate, exchange.Timezone);
    // date-fns-tz は無効なタイムゾーンでエラーをスローせず、Invalid Date を返す
    if (isNaN(zonedDate.getTime())) {
      throw new Error(TRADING_HOURS_ERROR_MESSAGES.INVALID_TIMEZONE);
    }
  } catch {
    throw new Error(TRADING_HOURS_ERROR_MESSAGES.INVALID_TIMEZONE);
  }

  // 曜日チェック (0=日曜, 6=土曜)
  const dayOfWeek = zonedDate.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    // 土日は取引時間外
    return false;
  }

  // 現在時刻の時・分を取得
  const currentHours = zonedDate.getHours();
  const currentMinutes = zonedDate.getMinutes();
  const currentTotalMinutes = currentHours * 60 + currentMinutes;

  // 取引開始・終了時刻をパース
  const startTime = parseTime(exchange.Start);
  const endTime = parseTime(exchange.End);
  const startTotalMinutes = startTime.hours * 60 + startTime.minutes;
  const endTotalMinutes = endTime.hours * 60 + endTime.minutes;

  // 取引時間帯チェック
  // Start <= Current < End
  return currentTotalMinutes >= startTotalMinutes && currentTotalMinutes < endTotalMinutes;
}
