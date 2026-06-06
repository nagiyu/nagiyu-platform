import type { CharacterRenderProfile } from './types';

export type { CharacterRenderProfile } from './types';

/**
 * 描画用の既定キャラクター ID。
 *
 * core の `DEFAULT_CHARACTER_ID` と一致させる。ただしこのモジュールは
 * `'use client'` の Live2DCanvas から参照されるため、core のバレル
 * （server 専用の repositories / observability を芋づるで引き込む）を import しない。
 * core の値と一致していることは registry のテストで担保する。
 */
export const DEFAULT_RENDER_CHARACTER_ID = 'hiyori';

/**
 * 描画設定レジストリのエラーメッセージ定数。
 */
export const CHARACTER_RENDER_ERROR_MESSAGES = {
  UNKNOWN_RENDER_PROFILE: '指定されたキャラクターの描画設定が見つかりません。',
} as const;

/**
 * hiyori の描画設定。
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
 * 描画設定の静的レジストリ（id をキーに CharacterRenderProfile を保持）。
 * core 非依存なのでクライアントバンドルに含めても server コードを引き込まない。
 */
const RENDER_PROFILES: Record<string, CharacterRenderProfile> = {
  [DEFAULT_RENDER_CHARACTER_ID]: hiyoriRenderProfile,
};

/**
 * 指定 characterId に描画設定が登録されているか判定する。
 */
export function hasRenderProfile(characterId: string): boolean {
  return Object.prototype.hasOwnProperty.call(RENDER_PROFILES, characterId);
}

/**
 * 指定 characterId に対応する CharacterRenderProfile を返す。
 * characterId を省略した場合は DEFAULT_RENDER_CHARACTER_ID を使用する。
 * 未登録の id を指定した場合はエラーをスローする。
 */
export function getCharacterRenderProfile(
  characterId: string = DEFAULT_RENDER_CHARACTER_ID
): CharacterRenderProfile {
  if (!hasRenderProfile(characterId)) {
    throw new Error(CHARACTER_RENDER_ERROR_MESSAGES.UNKNOWN_RENDER_PROFILE);
  }
  return RENDER_PROFILES[characterId];
}

/**
 * 登録済みの描画設定 ID の一覧を返す（テスト・同期検証用）。
 */
export function getRegisteredRenderProfileIds(): string[] {
  return Object.keys(RENDER_PROFILES);
}
