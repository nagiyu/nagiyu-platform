/**
 * 記憶ページで使用するユーザー向け文言生成関数。
 *
 * lib/ に集約することでカバレッジ計測対象に含めつつ、コンポーネント間で文言を統一する。
 * 「編集機能を廃止し会話による訂正に誘導する」設計方針（Issue #3308）に基づく文言。
 * characterId を受け取り選択キャラの shortName を使うことで、キャラに追従した文言を返す。
 */
import { getCharacterDisplay } from '../characters/client-profiles';

/**
 * 記憶ページ冒頭に表示するガイダンスを返す。
 * 編集 UI を廃止したためキャラへの訂正依頼を促す。
 * @param characterId - 対象キャラクター ID。省略時は既定キャラクターを使用する。
 */
export function getMemoryPageGuidance(characterId?: string): string {
  const { shortName } = getCharacterDisplay(characterId);
  return `内容を変えたい場合は、${shortName}ちゃんに話しかけて訂正してね。`;
}

/**
 * 削除確認ダイアログに表示する注釈を返す。
 * MemoryEntity を削除しても MemorySummary（圧縮要約）・Messages（直近会話）には
 * 即時反映されないため、ユーザーが混乱しないよう明示する。
 * @param characterId - 対象キャラクター ID。省略時は既定キャラクターを使用する。
 */
export function getMemoryDeleteAnnotation(characterId?: string): string {
  const { shortName } = getCharacterDisplay(characterId);
  return `削除しても、直近の会話や圧縮要約にはすぐ反映されないよ。完全に忘れてほしい場合は、${shortName}ちゃんに直接話しかけて訂正をお願いしてね。`;
}
