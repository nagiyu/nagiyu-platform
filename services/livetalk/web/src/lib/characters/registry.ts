import { hiyori, DEFAULT_CHARACTER_ID } from '@nagiyu/livetalk-core';
import type { CharacterDefinition } from '@nagiyu/livetalk-core';
import {
  getCharacterRenderProfile,
  hasCharacterProfile,
  type CharacterRenderProfile,
} from './client-profiles';

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
 * キャラクター定義の静的レジストリ（id をキーに core の CharacterDefinition を保持）。
 *
 * このモジュールは core のバレルを import するため server 専用コードを引き込む。
 * `'use client'` のコンポーネントから直接 import しないこと
 * （クライアント側の情報が必要な場合は `./client-profiles` を使う）。
 */
const DEFINITIONS: Record<string, CharacterDefinition> = {
  [hiyori.id]: hiyori,
};

/**
 * 指定 characterId がレジストリに登録されているか判定する。
 * 定義と描画設定の両方が揃っている場合のみ true。
 */
export function hasCharacter(characterId: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(DEFINITIONS, characterId) &&
    hasCharacterProfile(characterId)
  );
}

/**
 * 指定 characterId に対応する CharacterEntry を返す。
 * characterId を省略した場合は DEFAULT_CHARACTER_ID を使用する。
 * 未登録の id を指定した場合はエラーをスローする。
 */
export function getCharacterEntry(characterId?: string): CharacterEntry {
  const id = characterId ?? DEFAULT_CHARACTER_ID;
  if (!hasCharacter(id)) {
    throw new Error(CHARACTER_REGISTRY_ERROR_MESSAGES.UNKNOWN_CHARACTER);
  }
  return {
    definition: DEFINITIONS[id],
    render: getCharacterRenderProfile(id),
  };
}

/**
 * 指定 characterId に対応する CharacterDefinition を返す。
 * characterId を省略した場合は DEFAULT_CHARACTER_ID を使用する。
 */
export function getCharacterDefinition(characterId?: string): CharacterDefinition {
  return getCharacterEntry(characterId).definition;
}

/**
 * 登録済みのキャラクター定義 ID の一覧を返す（テスト・同期検証用）。
 */
export function getRegisteredCharacterIds(): string[] {
  return Object.keys(DEFINITIONS);
}

// クライアントプロファイルを server 側からも参照できるよう再エクスポートする。
export {
  getCharacterRenderProfile,
  getCharacterDisplay,
  getCharacterClientProfile,
  hasCharacterProfile,
  DEFAULT_CLIENT_CHARACTER_ID,
  CHARACTER_PROFILE_ERROR_MESSAGES,
  type CharacterRenderProfile,
  type CharacterClientProfile,
  type CharacterDisplay,
} from './client-profiles';
