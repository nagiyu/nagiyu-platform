/**
 * 記憶ページで使用するユーザー向け文言定数。
 *
 * lib/ に集約することでカバレッジ計測対象に含めつつ、コンポーネント間で文言を統一する。
 * 「編集機能を廃止し会話による訂正に誘導する」設計方針（Issue #3308）に基づく文言。
 */
import { getCharacterDisplay } from '@/lib/characters/client-profiles';

const { shortName } = getCharacterDisplay();

/** 記憶ページ冒頭に表示するガイダンス。編集 UI を廃止したためキャラへの訂正依頼を促す。 */
export const MEMORY_PAGE_GUIDANCE = `内容を変えたい場合は、${shortName}ちゃんに話しかけて訂正してね。`;

/**
 * 削除確認ダイアログに表示する注釈。
 * MemoryEntity を削除しても MemorySummary（圧縮要約）・Messages（直近会話）には
 * 即時反映されないため、ユーザーが混乱しないよう明示する。
 */
export const MEMORY_DELETE_ANNOTATION = `削除しても、直近の会話や圧縮要約にはすぐ反映されないよ。完全に忘れてほしい場合は、${shortName}ちゃんに直接話しかけて訂正をお願いしてね。`;
