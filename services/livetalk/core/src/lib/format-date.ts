/**
 * Unix ms を JST の "M月D日" 表記に変換する純粋関数。
 *
 * 依頼 provenance（`WebRawEntity.RequestedAt` / `TopicEntity.RequestedAt`）を
 * consolidation・generate-note のプロンプトへ自然な日本語日付として渡すために使う。
 * `notification/escalation.ts` の `toJstDateString` と同じく、本番は `TZ=Asia/Tokyo`
 * で実行されることを前提とする（ローカル時刻の getMonth/getDate をそのまま使う）。
 */
export function formatJstMonthDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
