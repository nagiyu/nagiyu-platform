import { hiyori, DEFAULT_CHARACTER_ID } from '@nagiyu/livetalk-core';
import type { CharacterDefinition } from '@nagiyu/livetalk-core';
import type { CharacterRenderProfile } from './types';

/**
 * キャラクターレジストリのエラーメッセージ定数。
 */
export const CHARACTER_REGISTRY_ERROR_MESSAGES = {
  UNKNOWN_CHARACTER: '指定されたキャラクターが見つかりません。',
} as const;

/**
 * core の CharacterDefinition と web の CharacterRenderProfile をまとめたエントリ。
 */
export interface CharacterEntry {
  definition: CharacterDefinition;
  render: CharacterRenderProfile;
}

/**
 * hiyori の描画設定（既存の値を移植）。
 */
const hiyoriRenderProfile: CharacterRenderProfile = {
  modelPath: '/assets/characters/hiyori/runtime/hiyori_free_t08.model3.json',
  cubismParams: {
    mouthOpenY: 'ParamMouthOpenY',
    eyeLOpen: 'ParamEyeLOpen',
    eyeROpen: 'ParamEyeROpen',
  },
};

/**
 * 静的キャラクターレジストリ。
 * id をキーに CharacterEntry を保持する。
 * 将来のキャラ追加時はここにエントリを追加する。
 */
const REGISTRY: Record<string, CharacterEntry> = {
  [hiyori.id]: {
    definition: hiyori,
    render: hiyoriRenderProfile,
  },
};

/**
 * 指定 characterId に対応する CharacterEntry を返す。
 * characterId を省略した場合は DEFAULT_CHARACTER_ID を使用する。
 * 未登録の id を指定した場合はエラーをスローする。
 */
export function getCharacterEntry(characterId?: string): CharacterEntry {
  const id = characterId ?? DEFAULT_CHARACTER_ID;
  const entry = REGISTRY[id];
  if (!entry) {
    throw new Error(CHARACTER_REGISTRY_ERROR_MESSAGES.UNKNOWN_CHARACTER);
  }
  return entry;
}

/**
 * 指定 characterId に対応する CharacterDefinition を返す。
 * characterId を省略した場合は DEFAULT_CHARACTER_ID を使用する。
 */
export function getCharacterDefinition(characterId?: string): CharacterDefinition {
  return getCharacterEntry(characterId).definition;
}

/**
 * 指定 characterId に対応する CharacterRenderProfile を返す。
 * characterId を省略した場合は DEFAULT_CHARACTER_ID を使用する。
 */
export function getCharacterRenderProfile(characterId?: string): CharacterRenderProfile {
  return getCharacterEntry(characterId).render;
}

/**
 * 指定 characterId がレジストリに登録されているか判定する。
 * route の入力バリデーション等で使用する。
 */
export function hasCharacter(characterId: string): boolean {
  return characterId in REGISTRY;
}
