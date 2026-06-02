/**
 * ノートページで使用するユーザー向け文言定数。
 *
 * lib/ に集約することでカバレッジ計測対象に含めつつ、コンポーネント間で文言を統一する。
 */

/** ノート一覧冒頭に表示するガイダンス。「これ、あなたのために調べたの」というプレゼント体験の文脈。 */
export const NOTE_PAGE_GUIDANCE = 'ひよりちゃんがあなたのために調べてまとめたノートだよ。';

/** ノートが 1 件も無いときの空状態メッセージ。 */
export const NOTE_EMPTY_MESSAGE =
  'まだノートはないよ。ひよりちゃんがいろいろ調べてくれるのを待っててね。';

/**
 * createdAt（Unix ms）を日本語の日付文字列に整形する。
 */
export function formatNoteDate(createdAt: number): string {
  const date = new Date(createdAt);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}年${month}月${day}日`;
}
