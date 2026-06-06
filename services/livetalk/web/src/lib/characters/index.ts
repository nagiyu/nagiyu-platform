// このバレルは client-safe なモジュールのみを再エクスポートする。
// 定義の結合（core 依存）が必要な server コードは `./registry` を直接 import すること。
export type { CharacterRenderProfile } from './types';
export {
  DEFAULT_RENDER_CHARACTER_ID,
  CHARACTER_RENDER_ERROR_MESSAGES,
  getCharacterRenderProfile,
  hasRenderProfile,
} from './render-profiles';
