import type { CharacterClientProfile, CharacterDisplay, CharacterRenderProfile } from './types';
import { LIVETALK_LICENSE_TEXT } from '../legal/terms-data';

export type { CharacterClientProfile, CharacterDisplay, CharacterRenderProfile } from './types';

/**
 * クライアント側の既定キャラクター ID。
 *
 * core の `DEFAULT_CHARACTER_ID` と一致させる。ただしこのモジュールは
 * `'use client'` のコンポーネントから参照されるため、core のバレル
 * （server 専用の repositories / observability を芋づるで引き込む）を import しない。
 * core の値と一致していることは registry のテストで担保する。
 */
export const DEFAULT_CLIENT_CHARACTER_ID = 'hiyori';

/**
 * クライアントプロファイルのエラーメッセージ定数。
 */
export const CHARACTER_PROFILE_ERROR_MESSAGES = {
  UNKNOWN_PROFILE: '指定されたキャラクターのプロファイルが見つかりません。',
} as const;

/**
 * キャラクタープロファイルの静的レジストリ（id をキーに CharacterClientProfile を保持）。
 * core 非依存なのでクライアントバンドルに含めても server コードを引き込まない。
 */
const PROFILES: Record<string, CharacterClientProfile> = {
  [DEFAULT_CLIENT_CHARACTER_ID]: {
    display: {
      displayName: '桃瀬ひより',
      shortName: 'ひより',
    },
    render: {
      modelPath: '/assets/characters/hiyori/runtime/hiyori_free_t08.model3.json',
      cubismParams: {
        mouthOpenY: 'ParamMouthOpenY',
        eyeLOpen: 'ParamEyeLOpen',
        eyeROpen: 'ParamEyeROpen',
      },
    },
    licenseText: LIVETALK_LICENSE_TEXT,
  },
};

/**
 * 指定 id にプロファイルが登録されているか判定する。
 * プロトタイプ継承プロパティ（'toString' 等）は false を返す。
 */
export function hasCharacterProfile(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROFILES, id);
}

/**
 * 指定 id に対応する CharacterClientProfile を返す。
 * id を省略した場合は DEFAULT_CLIENT_CHARACTER_ID を使用する。
 * 未登録の id を指定した場合はエラーをスローする。
 */
export function getCharacterClientProfile(
  id: string = DEFAULT_CLIENT_CHARACTER_ID
): CharacterClientProfile {
  if (!hasCharacterProfile(id)) {
    throw new Error(CHARACTER_PROFILE_ERROR_MESSAGES.UNKNOWN_PROFILE);
  }
  return PROFILES[id];
}

/**
 * 指定 id に対応する CharacterRenderProfile を返す。
 * id を省略した場合は DEFAULT_CLIENT_CHARACTER_ID を使用する。
 * Live2DCanvas との互換性のために維持する。
 */
export function getCharacterRenderProfile(id?: string): CharacterRenderProfile {
  return getCharacterClientProfile(id).render;
}

/**
 * 指定 id に対応する CharacterDisplay を返す。
 * id を省略した場合は DEFAULT_CLIENT_CHARACTER_ID を使用する。
 */
export function getCharacterDisplay(id?: string): CharacterDisplay {
  return getCharacterClientProfile(id).display;
}

/**
 * 登録済みのプロファイル ID の一覧を返す（テスト・同期検証用）。
 */
export function getRegisteredProfileIds(): string[] {
  return Object.keys(PROFILES);
}

/**
 * 指定 id に対応するライセンス・クレジット文字列を返す。
 * id を省略した場合は DEFAULT_CLIENT_CHARACTER_ID を使用する。
 * 未登録の id を指定した場合はエラーをスローする。
 */
export function getCharacterLicenseText(id?: string): string {
  return getCharacterClientProfile(id).licenseText;
}
