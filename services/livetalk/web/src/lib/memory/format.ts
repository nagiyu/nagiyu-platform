import type { Tier } from '@nagiyu/livetalk-core';

/**
 * 記憶編集 UI 用の表示整形ヘルパー（純粋関数、カバレッジ対象）。
 */

/** Tier の人間可読ラベル。 */
export const TIER_LABELS: Record<Tier, string> = {
  A: '確定',
  B: '嗜好',
  C: '観測',
  D: '一時',
};

/** Tier の説明（ツールチップ用）。 */
export const TIER_DESCRIPTIONS: Record<Tier, string> = {
  A: '名前や誕生日など、はっきり確認できたこと',
  B: '何度も話してくれた好みや興味',
  C: '一度だけ聞いたこと（うろ覚え）',
  D: '今の会話だけの一時的なメモ',
};

/**
 * confidence（0.0〜1.0）を 5 段階の星数（0〜5）に変換する。
 */
export function confidenceToStars(confidence: number): number {
  const clamped = Math.max(0, Math.min(1, confidence));
  return Math.round(clamped * 5);
}

/**
 * 最終参照日時（Unix ms）を「YYYY/MM/DD」表記にする。未参照なら「まだ話していない」。
 */
export function formatLastReferenced(lastReferencedAt: number | undefined): string {
  if (lastReferencedAt === undefined) return 'まだ話していない';
  const date = new Date(lastReferencedAt);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
}
