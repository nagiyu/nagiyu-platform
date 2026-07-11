/**
 * 記憶ページで使用するユーザー向け文言生成関数。
 *
 * lib/ に集約することでカバレッジ計測対象に含めつつ、コンポーネント間で文言を統一する。
 * リブトーク知識再設計 P2（#3698）で SELF fact 一覧＋決定的削除に切り替えたことに合わせ、
 * 「編集は会話による訂正」「削除は確実に忘れる」旨の文言にする。
 * characterId を受け取り選択キャラの shortName を使うことで、キャラに追従した文言を返す。
 */
import { getCharacterDisplay } from '../characters/client-profiles';

/**
 * 記憶ページ冒頭に表示するガイダンスを返す。
 * SELF fact の一覧であること・削除できること・内容を変えたい場合は会話で訂正することを伝える。
 * @param characterId - 対象キャラクター ID。省略時は既定キャラクターを使用する。
 */
export function getMemoryPageGuidance(characterId?: string): string {
  const { shortName } = getCharacterDisplay(characterId);
  return `ここは${shortName}ちゃんがあなたについて覚えていることだよ。消したい項目は削除してね。内容を変えたいときは話しかけて訂正してね。`;
}

/**
 * 削除確認ダイアログに表示する注釈を返す。
 * 削除は決定的（deleteSelfFact→canonicalSummary 再生成）であり、以降の会話には
 * 出てこなくなること・元に戻せないことを明示する（リブトーク知識再設計 P2 / #3698）。
 * @param characterId - 対象キャラクター ID。省略時は既定キャラクターを使用する。
 */
export function getMemoryDeleteAnnotation(characterId?: string): string {
  const { shortName } = getCharacterDisplay(characterId);
  return `削除すると${shortName}ちゃんはこの内容を確実に忘れて、以降の会話には出てこなくなるよ。元には戻せない。`;
}
