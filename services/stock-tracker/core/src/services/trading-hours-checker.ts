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
