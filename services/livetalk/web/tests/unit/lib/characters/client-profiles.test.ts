/**
 * @jest-environment node
 */
import {
  CHARACTER_PROFILE_ERROR_MESSAGES,
  DEFAULT_CLIENT_CHARACTER_ID,
  getCharacterClientProfile,
  getCharacterDisplay,
  getCharacterLicenseText,
  getCharacterRenderProfile,
  getRegisteredProfileIds,
  hasCharacterProfile,
} from '@/lib/characters/client-profiles';
import { LIVETALK_LICENSE_TEXT } from '@/lib/legal/terms-data';

describe('クライアントプロファイルレジストリ', () => {
  describe('getCharacterRenderProfile', () => {
    it('引数なしで既定キャラクターの描画設定を返す', () => {
      const profile = getCharacterRenderProfile();
      expect(profile.modelPath).toBe(
        '/assets/characters/hiyori/runtime/hiyori_free_t08.model3.json'
      );
    });

    it('cubismParams が Cubism 標準のパラメータ ID を返す', () => {
      const profile = getCharacterRenderProfile(DEFAULT_CLIENT_CHARACTER_ID);
      expect(profile.cubismParams.mouthOpenY).toBe('ParamMouthOpenY');
      expect(profile.cubismParams.eyeLOpen).toBe('ParamEyeLOpen');
      expect(profile.cubismParams.eyeROpen).toBe('ParamEyeROpen');
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
      expect(profile.render.modelPath).toBe(
        '/assets/characters/hiyori/runtime/hiyori_free_t08.model3.json'
      );
    });

    it('display と render の両方が揃っている', () => {
      const profile = getCharacterClientProfile(DEFAULT_CLIENT_CHARACTER_ID);
      expect(profile.display).toBeDefined();
      expect(profile.render).toBeDefined();
      expect(profile.render.cubismParams).toBeDefined();
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
