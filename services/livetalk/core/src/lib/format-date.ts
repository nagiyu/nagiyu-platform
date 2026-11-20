import { toJstDateString } from '@nagiyu/common';

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
