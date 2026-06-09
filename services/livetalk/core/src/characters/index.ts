export type { CharacterDefinition, PersonalityDefinition } from './types.js';
export { hiyori } from './hiyori.js';
export { ageha } from './ageha.js';
export {
  buildSystemPrompt,
  buildChatMessages,
  getTimeOfDay,
  type TimeOfDay,
} from './prompt-builder.js';

import { hiyori } from './hiyori.js';
import { ageha } from './ageha.js';
import type { CharacterDefinition } from './types.js';

/**
 * 全キャラクター定義の配列。
 * 新しいキャラを追加する際はここに追記する。
 */
export const CHARACTER_DEFINITIONS: CharacterDefinition[] = [hiyori, ageha];

/**
 * 登録済み全キャラクターの ID 一覧を返す。
 * batch からキャラ走査に使用する（Phase B 以降）。
 */
export function getAllCharacterIds(): string[] {
  return CHARACTER_DEFINITIONS.map((c) => c.id);
}

/**
 * ID からキャラクター定義を返す。見つからなければ undefined を返す。
 */
export function getCharacterDefinitionById(id: string): CharacterDefinition | undefined {
  return CHARACTER_DEFINITIONS.find((c) => c.id === id);
}
