/**
 * ノートページで使用するユーザー向け文言生成関数。
 *
 * lib/ に集約することでカバレッジ計測対象に含めつつ、コンポーネント間で文言を統一する。
 * characterId を受け取り選択キャラの shortName を使うことで、キャラに追従した文言を返す。
 */
import { getCharacterDisplay } from '../characters/client-profiles';

/**
 * ノート一覧冒頭に表示するガイダンスを返す。
 * 「これ、あなたのために調べたの」というプレゼント体験の文脈。
 * @param characterId - 対象キャラクター ID。省略時は既定キャラクターを使用する。
 */
export function getNotePageGuidance(characterId?: string): string {
  const { shortName } = getCharacterDisplay(characterId);
  return `${shortName}ちゃんがあなたのために調べてまとめたノートだよ。`;
}

/**
 * ノートが 1 件も無いときの空状態メッセージを返す。
 * @param characterId - 対象キャラクター ID。省略時は既定キャラクターを使用する。
 */
export function getNoteEmptyMessage(characterId?: string): string {
  const { shortName } = getCharacterDisplay(characterId);
  return `まだノートはないよ。${shortName}ちゃんがいろいろ調べてくれるのを待っててね。`;
}

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
