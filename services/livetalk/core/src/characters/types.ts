/**
 * CharacterDefinition 抽象化レイヤーの型定義（Phase 2c / Issue #3249）。
 *
 * 将来の複数キャラ対応に備えて抽象化する。MVP では桃瀬ひより 1 キャラ固定。
 *
 * @see docs/services/livetalk/architecture.md §2.10（CharacterDefinition 抽象化）
 * @see Issue #3249
 */

export interface VoiceDefinition {
  speakerId: number;
}

export interface PersonalityDefinition {
  /** 基本の system prompt 本文 */
  basePrompt: string;
  /** 口調・一人称の説明 */
  speechStyle: string;
  /** 嗜好（Phase 3 で動的拡張）*/
  preferences: {
    likes: string[];
    dislikes: string[];
  };
}

export interface CharacterDefinition {
  id: string;
  displayName: string;
  personality: PersonalityDefinition;
  voiceConfig: VoiceDefinition;
  license: {
    displayText: string;
    creditName: string;
  };
}
