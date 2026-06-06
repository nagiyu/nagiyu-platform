/**
 * @jest-environment node
 */
import {
  CHARACTER_REGISTRY_ERROR_MESSAGES,
  getCharacterEntry,
  getCharacterDefinition,
  getCharacterRenderProfile,
  hasCharacter,
} from '@/lib/characters/registry';
import { DEFAULT_CHARACTER_ID } from '@nagiyu/livetalk-core';

describe('キャラクターレジストリ', () => {
  describe('getCharacterEntry', () => {
    it('引数なしで呼び出すと hiyori の CharacterEntry を返す', () => {
      const entry = getCharacterEntry();
      expect(entry.definition.id).toBe('hiyori');
      expect(entry.definition.displayName).toBe('桃瀬ひより');
    });

    it('DEFAULT_CHARACTER_ID を明示的に渡しても hiyori を返す', () => {
      const entry = getCharacterEntry(DEFAULT_CHARACTER_ID);
      expect(entry.definition.id).toBe(DEFAULT_CHARACTER_ID);
    });

    it('"hiyori" を指定すると hiyori の CharacterEntry を返す', () => {
      const entry = getCharacterEntry('hiyori');
      expect(entry.definition.id).toBe('hiyori');
      expect(entry.render.modelPath).toBeDefined();
    });

    it('未登録の characterId を指定すると日本語定数メッセージで Error をスローする', () => {
      expect(() => getCharacterEntry('unknown')).toThrow(
        CHARACTER_REGISTRY_ERROR_MESSAGES.UNKNOWN_CHARACTER
      );
    });

    it('エラーメッセージ定数は日本語を含む', () => {
      expect(CHARACTER_REGISTRY_ERROR_MESSAGES.UNKNOWN_CHARACTER).toMatch(/[ぁ-ん]/);
    });
  });

  describe('getCharacterDefinition', () => {
    it('引数なしで hiyori の CharacterDefinition を返す', () => {
      const definition = getCharacterDefinition();
      expect(definition.id).toBe('hiyori');
      expect(definition.displayName).toBe('桃瀬ひより');
    });

    it('"hiyori" を指定すると CharacterDefinition を返す', () => {
      const definition = getCharacterDefinition('hiyori');
      expect(definition.id).toBe('hiyori');
      expect(definition.personality).toBeDefined();
      expect(definition.voiceConfig).toBeDefined();
      expect(definition.license).toBeDefined();
    });

    it('未登録の id を指定するとスローする', () => {
      expect(() => getCharacterDefinition('unknown')).toThrow(
        CHARACTER_REGISTRY_ERROR_MESSAGES.UNKNOWN_CHARACTER
      );
    });
  });

  describe('getCharacterRenderProfile', () => {
    it('引数なしで hiyori の CharacterRenderProfile を返す', () => {
      const renderProfile = getCharacterRenderProfile();
      expect(renderProfile.modelPath).toBe(
        '/assets/characters/hiyori/runtime/hiyori_free_t08.model3.json'
      );
    });

    it('modelPath が正しいパスを返す', () => {
      const renderProfile = getCharacterRenderProfile('hiyori');
      expect(renderProfile.modelPath).toBe(
        '/assets/characters/hiyori/runtime/hiyori_free_t08.model3.json'
      );
    });

    it('cubismParams.mouthOpenY が正しいパラメータ ID を返す', () => {
      const renderProfile = getCharacterRenderProfile('hiyori');
      expect(renderProfile.cubismParams.mouthOpenY).toBe('ParamMouthOpenY');
    });

    it('cubismParams.eyeLOpen が正しいパラメータ ID を返す', () => {
      const renderProfile = getCharacterRenderProfile('hiyori');
      expect(renderProfile.cubismParams.eyeLOpen).toBe('ParamEyeLOpen');
    });

    it('cubismParams.eyeROpen が正しいパラメータ ID を返す', () => {
      const renderProfile = getCharacterRenderProfile('hiyori');
      expect(renderProfile.cubismParams.eyeROpen).toBe('ParamEyeROpen');
    });

    it('未登録の id を指定するとスローする', () => {
      expect(() => getCharacterRenderProfile('unknown')).toThrow(
        CHARACTER_REGISTRY_ERROR_MESSAGES.UNKNOWN_CHARACTER
      );
    });
  });

  describe('hasCharacter', () => {
    it('"hiyori" は登録済みなので true を返す', () => {
      expect(hasCharacter('hiyori')).toBe(true);
    });

    it('未登録の id は false を返す', () => {
      expect(hasCharacter('unknown')).toBe(false);
    });

    it('空文字列は false を返す', () => {
      expect(hasCharacter('')).toBe(false);
    });
  });
});
