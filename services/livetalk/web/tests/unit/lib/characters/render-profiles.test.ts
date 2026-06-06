/**
 * @jest-environment node
 */
import {
  CHARACTER_RENDER_ERROR_MESSAGES,
  DEFAULT_RENDER_CHARACTER_ID,
  getCharacterRenderProfile,
  getRegisteredRenderProfileIds,
  hasRenderProfile,
} from '@/lib/characters/render-profiles';

describe('描画設定レジストリ', () => {
  describe('getCharacterRenderProfile', () => {
    it('引数なしで既定キャラクターの描画設定を返す', () => {
      const profile = getCharacterRenderProfile();
      expect(profile.modelPath).toBe(
        '/assets/characters/hiyori/runtime/hiyori_free_t08.model3.json'
      );
    });

    it('cubismParams が Cubism 標準のパラメータ ID を返す', () => {
      const profile = getCharacterRenderProfile(DEFAULT_RENDER_CHARACTER_ID);
      expect(profile.cubismParams.mouthOpenY).toBe('ParamMouthOpenY');
      expect(profile.cubismParams.eyeLOpen).toBe('ParamEyeLOpen');
      expect(profile.cubismParams.eyeROpen).toBe('ParamEyeROpen');
    });

    it('未登録の id を指定すると日本語定数メッセージでスローする', () => {
      expect(() => getCharacterRenderProfile('unknown')).toThrow(
        CHARACTER_RENDER_ERROR_MESSAGES.UNKNOWN_RENDER_PROFILE
      );
    });

    it('"toString" などプロトタイプ継承プロパティ名を渡すとスローする', () => {
      expect(() => getCharacterRenderProfile('toString')).toThrow(
        CHARACTER_RENDER_ERROR_MESSAGES.UNKNOWN_RENDER_PROFILE
      );
    });
  });

  describe('hasRenderProfile', () => {
    it('登録済み id は true、未登録 id は false を返す', () => {
      expect(hasRenderProfile(DEFAULT_RENDER_CHARACTER_ID)).toBe(true);
      expect(hasRenderProfile('unknown')).toBe(false);
    });

    it('Object.prototype のプロパティ名は false を返す', () => {
      expect(hasRenderProfile('toString')).toBe(false);
      expect(hasRenderProfile('constructor')).toBe(false);
    });
  });

  describe('getRegisteredRenderProfileIds', () => {
    it('既定キャラクターを含む', () => {
      expect(getRegisteredRenderProfileIds()).toContain(DEFAULT_RENDER_CHARACTER_ID);
    });
  });

  describe('エラーメッセージ定数', () => {
    it('日本語を含む', () => {
      expect(CHARACTER_RENDER_ERROR_MESSAGES.UNKNOWN_RENDER_PROFILE).toMatch(/[ぁ-ん]/);
    });
  });
});
