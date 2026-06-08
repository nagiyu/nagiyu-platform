/**
 * @jest-environment node
 */
import {
  CHARACTER_PROFILE_ERROR_MESSAGES,
  DEFAULT_CLIENT_CHARACTER_ID,
  getCharacterClientProfile,
  getCharacterDescription,
  getCharacterDisplay,
  getCharacterLicenseText,
  getCharacterModel,
  getCharacterRenderProfile,
  getCharacterVoice,
  getRegisteredProfileIds,
  hasCharacterProfile,
} from '@/lib/characters/client-profiles';
import { LIVETALK_LICENSE_TEXT } from '@/lib/legal/terms-data';

describe('クライアントプロファイルレジストリ', () => {
  describe('getCharacterRenderProfile', () => {
    it('引数なしで既定キャラクターの描画設定を返す', () => {
      const profile = getCharacterRenderProfile();
      // hiyori は live2d renderer であるため、renderer で narrowing してから参照する
      expect(profile.renderer).toBe('live2d');
      if (profile.renderer === 'live2d') {
        expect(profile.modelPath).toBe(
          '/assets/characters/hiyori/runtime/hiyori_free_t08.model3.json'
        );
      }
    });

    it('cubismParams が Cubism 標準のパラメータ ID を返す', () => {
      const profile = getCharacterRenderProfile(DEFAULT_CLIENT_CHARACTER_ID);
      // renderer で narrowing してから cubismParams を参照する
      expect(profile.renderer).toBe('live2d');
      if (profile.renderer === 'live2d') {
        expect(profile.cubismParams.mouthOpenY).toBe('ParamMouthOpenY');
        expect(profile.cubismParams.eyeLOpen).toBe('ParamEyeLOpen');
        expect(profile.cubismParams.eyeROpen).toBe('ParamEyeROpen');
      }
    });

    it('未登録の id を指定すると日本語定数メッセージでスローする', () => {
      expect(() => getCharacterRenderProfile('unknown')).toThrow(
        CHARACTER_PROFILE_ERROR_MESSAGES.UNKNOWN_PROFILE
      );
    });

    it('"toString" などプロトタイプ継承プロパティ名を渡すとスローする', () => {
      expect(() => getCharacterRenderProfile('toString')).toThrow(
        CHARACTER_PROFILE_ERROR_MESSAGES.UNKNOWN_PROFILE
      );
    });
  });

  describe('getCharacterDisplay', () => {
    it('引数なしで既定キャラクターの表示名を返す', () => {
      const display = getCharacterDisplay();
      expect(display.displayName).toBe('桃瀬ひより');
      expect(display.shortName).toBe('ひより');
    });

    it('DEFAULT_CLIENT_CHARACTER_ID を明示的に渡しても同じ表示名を返す', () => {
      const display = getCharacterDisplay(DEFAULT_CLIENT_CHARACTER_ID);
      expect(display.displayName).toBe('桃瀬ひより');
      expect(display.shortName).toBe('ひより');
    });

    it('未登録の id を指定するとスローする', () => {
      expect(() => getCharacterDisplay('unknown')).toThrow(
        CHARACTER_PROFILE_ERROR_MESSAGES.UNKNOWN_PROFILE
      );
    });

    it('"toString" などプロトタイプ継承プロパティ名を渡すとスローする', () => {
      expect(() => getCharacterDisplay('toString')).toThrow(
        CHARACTER_PROFILE_ERROR_MESSAGES.UNKNOWN_PROFILE
      );
    });
  });

  describe('getCharacterClientProfile', () => {
    it('引数なしで既定キャラクターのプロファイル全体を返す', () => {
      const profile = getCharacterClientProfile();
      expect(profile.display.displayName).toBe('桃瀬ひより');
      expect(profile.display.shortName).toBe('ひより');
      // renderer で narrowing してから live2d 固有フィールドを参照する
      expect(profile.render.renderer).toBe('live2d');
      if (profile.render.renderer === 'live2d') {
        expect(profile.render.modelPath).toBe(
          '/assets/characters/hiyori/runtime/hiyori_free_t08.model3.json'
        );
      }
    });

    it('display と render の両方が揃っている', () => {
      const profile = getCharacterClientProfile(DEFAULT_CLIENT_CHARACTER_ID);
      expect(profile.display).toBeDefined();
      expect(profile.render).toBeDefined();
      // renderer で narrowing してから cubismParams を参照する
      expect(profile.render.renderer).toBe('live2d');
      if (profile.render.renderer === 'live2d') {
        expect(profile.render.cubismParams).toBeDefined();
      }
    });

    it('未登録の id を指定すると日本語定数メッセージでスローする', () => {
      expect(() => getCharacterClientProfile('unknown')).toThrow(
        CHARACTER_PROFILE_ERROR_MESSAGES.UNKNOWN_PROFILE
      );
    });

    it('"constructor" などプロトタイプ継承プロパティ名を渡すとスローする', () => {
      expect(() => getCharacterClientProfile('constructor')).toThrow(
        CHARACTER_PROFILE_ERROR_MESSAGES.UNKNOWN_PROFILE
      );
    });
  });

  describe('hasCharacterProfile', () => {
    it('登録済み id は true、未登録 id は false を返す', () => {
      expect(hasCharacterProfile(DEFAULT_CLIENT_CHARACTER_ID)).toBe(true);
      expect(hasCharacterProfile('unknown')).toBe(false);
    });

    it('Object.prototype のプロパティ名は false を返す', () => {
      expect(hasCharacterProfile('toString')).toBe(false);
      expect(hasCharacterProfile('constructor')).toBe(false);
    });

    it('空文字列は false を返す', () => {
      expect(hasCharacterProfile('')).toBe(false);
    });
  });

  describe('getRegisteredProfileIds', () => {
    it('既定キャラクターを含む', () => {
      expect(getRegisteredProfileIds()).toContain(DEFAULT_CLIENT_CHARACTER_ID);
    });

    it('配列を返す', () => {
      expect(Array.isArray(getRegisteredProfileIds())).toBe(true);
    });
  });

  describe('エラーメッセージ定数', () => {
    it('日本語を含む', () => {
      expect(CHARACTER_PROFILE_ERROR_MESSAGES.UNKNOWN_PROFILE).toMatch(/[ぁ-ん]/);
    });
  });
});

describe('getCharacterDescription', () => {
  it('引数なしで既定キャラクター（hiyori）の説明を返す', () => {
    const desc = getCharacterDescription();
    expect(typeof desc).toBe('string');
    expect(desc.length).toBeGreaterThan(0);
  });

  it('DEFAULT_CLIENT_CHARACTER_ID を明示的に渡しても同じ説明を返す', () => {
    expect(getCharacterDescription(DEFAULT_CLIENT_CHARACTER_ID)).toBe(getCharacterDescription());
  });

  it('プロファイルに description フィールドが存在し文字列である', () => {
    const profile = getCharacterClientProfile(DEFAULT_CLIENT_CHARACTER_ID);
    expect(typeof profile.description).toBe('string');
    expect(profile.description.length).toBeGreaterThan(0);
  });

  it('未登録の id を指定すると日本語定数メッセージでスローする', () => {
    expect(() => getCharacterDescription('unknown')).toThrow(
      CHARACTER_PROFILE_ERROR_MESSAGES.UNKNOWN_PROFILE
    );
  });

  it('"toString" などプロトタイプ継承プロパティ名を渡すとスローする', () => {
    expect(() => getCharacterDescription('toString')).toThrow(
      CHARACTER_PROFILE_ERROR_MESSAGES.UNKNOWN_PROFILE
    );
  });
});

describe('getCharacterModel / getCharacterVoice', () => {
  it('hiyori のモデル属性は Live2D の「桃瀬ひより」である', () => {
    const model = getCharacterModel();
    expect(model.engine).toBe('Live2D');
    expect(model.name).toBe('桃瀬ひより');
  });

  it('hiyori の音声属性は VOICEVOX の「冥鳴ひまり」である', () => {
    const voice = getCharacterVoice();
    expect(voice.engine).toBe('VOICEVOX');
    expect(voice.name).toBe('冥鳴ひまり');
  });

  it('プロファイルに model / voice フィールドが存在する', () => {
    const profile = getCharacterClientProfile(DEFAULT_CLIENT_CHARACTER_ID);
    expect(profile.model.engine.length).toBeGreaterThan(0);
    expect(profile.model.name.length).toBeGreaterThan(0);
    expect(profile.voice.engine.length).toBeGreaterThan(0);
    expect(profile.voice.name.length).toBeGreaterThan(0);
  });

  it('未登録の id を指定すると日本語定数メッセージでスローする', () => {
    expect(() => getCharacterModel('unknown')).toThrow(
      CHARACTER_PROFILE_ERROR_MESSAGES.UNKNOWN_PROFILE
    );
    expect(() => getCharacterVoice('unknown')).toThrow(
      CHARACTER_PROFILE_ERROR_MESSAGES.UNKNOWN_PROFILE
    );
  });
});

describe('getCharacterLicenseText', () => {
  it('引数なしで既定キャラクター（hiyori）の権利テキストを返す', () => {
    const text = getCharacterLicenseText();
    expect(text).toBe(LIVETALK_LICENSE_TEXT);
  });

  it('hiyori の権利テキストは VOICEVOX クレジットと Live2D クレジットを含む', () => {
    const text = getCharacterLicenseText(DEFAULT_CLIENT_CHARACTER_ID);
    expect(text).toContain('VOICEVOX');
    expect(text).toContain('Live2D');
  });

  it('未登録の id を指定すると日本語定数メッセージでスローする', () => {
    expect(() => getCharacterLicenseText('unknown')).toThrow(
      CHARACTER_PROFILE_ERROR_MESSAGES.UNKNOWN_PROFILE
    );
  });

  it('プロファイルに licenseText フィールドが存在する', () => {
    const profile = getCharacterClientProfile(DEFAULT_CLIENT_CHARACTER_ID);
    expect(typeof profile.licenseText).toBe('string');
    expect(profile.licenseText.length).toBeGreaterThan(0);
  });
});
