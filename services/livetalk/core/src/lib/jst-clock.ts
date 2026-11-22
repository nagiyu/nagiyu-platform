import { toJstDayStartMs } from '@nagiyu/common';

const MINUTE_MS = 60 * 1000;

/**
 * 日本時間の 0:00 からの経過分 (0〜1439) を返す。
 *
 * Date のローカル時刻機能は実行環境のタイムゾーンに依存するため使わない。
 * 日本時間に夏時間はなく、日の境界は固定のずれで求まるので、日の始まりからの差で換算する。
 */
export function getJstMinutesOfDay(date: Date): number {
  const ms = date.getTime();
  return Math.floor((ms - toJstDayStartMs(ms)) / MINUTE_MS);
}

/** 日本時間の時 (0〜23) を返す */
export function getJstHour(date: Date): number {
  return Math.floor(getJstMinutesOfDay(date) / 60);
}
