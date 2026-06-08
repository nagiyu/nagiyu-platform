// このバレルは client-safe なモジュールのみを再エクスポートする。
// 定義の結合（core 依存）が必要な server コードは `./registry` を直接 import すること。
export type {
  CharacterRenderProfile,
  CharacterDisplay,
  CharacterClientProfile,
  CharacterAttribute,
} from './types';
export {
  DEFAULT_CLIENT_CHARACTER_ID,
  CHARACTER_PROFILE_ERROR_MESSAGES,
  getCharacterRenderProfile,
  getCharacterDisplay,
  getCharacterClientProfile,
  hasCharacterProfile,
  getRegisteredProfileIds,
  getCharacterLicenseText,
  getCharacterDescription,
  getCharacterModel,
  getCharacterVoice,
} from './client-profiles';
