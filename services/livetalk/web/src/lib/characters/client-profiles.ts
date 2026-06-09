import type {
  CharacterAttribute,
  CharacterClientProfile,
  CharacterDisplay,
  CharacterRenderProfile,
} from './types';
import { LIVETALK_LICENSE_TEXT } from '../legal/terms-data';

export type {
  CharacterAttribute,
  CharacterClientProfile,
  CharacterDisplay,
  CharacterRenderProfile,
} from './types';

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
 * 早瀬アゲハ のライセンス・クレジット文字列。
 * 音声は OpenAI TTS を使用するため、AI 生成音声であることの明示が OpenAI 利用規約上必須。
 * イラストは OpenAI gpt-image による AI 生成。規約上の必須表記ではないが、AI 生成物を
 * 人間作と誤認させない（OpenAI 利用ポリシー）ため、音声開示と足並みを揃えて明示する。
 */
export const AGEHA_LICENSE_TEXT =
  'イラスト：OpenAI gpt-image による AI 生成 / 音声：OpenAI TTS による AI 生成音声（人間の音声ではありません）';

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
      renderer: 'live2d',
      modelPath: '/assets/characters/hiyori/runtime/hiyori_free_t08.model3.json',
      cubismParams: {
        mouthOpenY: 'ParamMouthOpenY',
        eyeLOpen: 'ParamEyeLOpen',
        eyeROpen: 'ParamEyeROpen',
      },
    },
    licenseText: LIVETALK_LICENSE_TEXT,
    description: '甘いものと猫が大好きな癒し系。のんびりおしゃべりして、ほっと一息つける女の子。',
    model: { engine: 'Live2D', name: '桃瀬ひより' },
    voice: { engine: 'VOICEVOX', name: '冥鳴ひまり' },
  },
  ageha: {
    display: {
      displayName: '早瀬アゲハ',
      shortName: 'アゲハ',
    },
    render: {
      renderer: 'still',
      imagePath: '/assets/characters/ageha/still.png',
    },
    licenseText: AGEHA_LICENSE_TEXT,
    description:
      'テンション高めで背中を押してくれる相棒ギャル。落ち込んでも隣でアゲてくれる、ノリのいい女の子。',
    model: { engine: '一枚絵', name: '早瀬アゲハ' },
    voice: { engine: 'OpenAI TTS', name: 'nova' },
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

/**
 * 指定 id に対応するユーザー向け特徴・性格説明を返す。
 * id を省略した場合は DEFAULT_CLIENT_CHARACTER_ID を使用する。
 * 未登録の id を指定した場合はエラーをスローする。
 */
export function getCharacterDescription(id?: string): string {
  return getCharacterClientProfile(id).description;
}

/**
 * 指定 id に対応する見た目モデルの技術属性を返す。
 * id を省略した場合は DEFAULT_CLIENT_CHARACTER_ID を使用する。
 * 未登録の id を指定した場合はエラーをスローする。
 */
export function getCharacterModel(id?: string): CharacterAttribute {
  return getCharacterClientProfile(id).model;
}

/**
 * 指定 id に対応する音声の技術属性を返す。
 * id を省略した場合は DEFAULT_CLIENT_CHARACTER_ID を使用する。
 * 未登録の id を指定した場合はエラーをスローする。
 */
export function getCharacterVoice(id?: string): CharacterAttribute {
  return getCharacterClientProfile(id).voice;
}
