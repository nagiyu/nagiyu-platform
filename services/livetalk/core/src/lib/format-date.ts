import { toJstDateString } from '@nagiyu/common';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** 日本時間の年月日と曜日 (0 = 日曜) に分解する */
function toJstParts(ms: number): { year: number; month: number; day: number; weekday: number } {
  const [year, month, day] = toJstDateString(ms).split('-').map(Number);
  // 日本時間の暦日を UTC の暦日として組み直せば、曜日は実行環境のタイムゾーンに依らず決まる
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, weekday };
}

/**
 * Unix ms を日本時間の "M月D日" 表記に変換する純粋関数。
 *
 * 依頼 provenance（`WebRawEntity.requestedAt` / `TopicEntity.requestedAt`）を
 * consolidation・generate-note のプロンプトへ自然な日本語日付として渡すために使う。
 * 実行環境のタイムゾーンに依らず日本時間の月日になる。
 */
export function formatJstMonthDay(ms: number): string {
  const [, month, day] = toJstDateString(ms).split('-').map(Number);
  return `${month}月${day}日`;
}

/**
 * Unix ms を日本時間の "YYYY年M月D日(曜)" 表記に変換する。
 *
 * 会話の system prompt に「今日」を伝えるために使う。
 */
export function formatJstFullDateWithWeekday(ms: number): string {
  const { year, month, day, weekday } = toJstParts(ms);
  return `${year}年${month}月${day}日(${WEEKDAYS[weekday]})`;
}

/**
 * 事実の日付を、今日(nowMs)から見た日本時間の暦で "M月D日" 表記にする。
 *
 * 年が今日と異なるときだけ "YYYY年M月D日" とし、年をまたいだ古い事実を今年のことと取り違えさせない。
 */
export function formatJstFactDate(ms: number, nowMs: number): string {
  const { year } = toJstParts(ms);
  const { year: nowYear } = toJstParts(nowMs);
  return year === nowYear ? formatJstMonthDay(ms) : `${year}年${formatJstMonthDay(ms)}`;
}
