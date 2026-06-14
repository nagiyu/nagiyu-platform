/**
 * @jest-environment node
 */
import {
  CHARACTER_REGISTRY_ERROR_MESSAGES,
  getCharacterEntry,
  getCharacterDefinition,
  getRegisteredCharacterIds,
  hasCharacter,
} from '@/lib/characters/registry';
import {
  DEFAULT_CLIENT_CHARACTER_ID,
  getCharacterDisplay,
  hasCharacterProfile,
} from '@/lib/characters/client-profiles';
import { DEFAULT_CHARACTER_ID } from '@nagiyu/livetalk-core';

describe('キャラクターレジストリ', () => {
  describe('getCharacterEntry', () => {
    it('引数なしで呼び出すと hiyori の CharacterEntry を返す', () => {
      const entry = getCharacterEntry();
      expect(entry.definition.id).toBe('hiyori');
      expect(entry.definition.displayName).toBe('桃瀬ひより');
      // hiyori は live2d renderer であるため、renderer で narrowing してから参照する
      expect(entry.render.renderer).toBe('live2d');
      if (entry.render.renderer === 'live2d') {
        expect(entry.render.modelPath).toBe(
          '/assets/characters/hiyori/runtime/hiyori_free_t08.model3.json'
        );
      }
    });

    it('DEFAULT_CHARACTER_ID を明示的に渡しても hiyori を返す', () => {
      const entry = getCharacterEntry(DEFAULT_CHARACTER_ID);
      expect(entry.definition.id).toBe(DEFAULT_CHARACTER_ID);
    });

    it('"hiyori" を指定すると定義と描画設定の両方を返す', () => {
      const entry = getCharacterEntry('hiyori');
      expect(entry.definition.id).toBe('hiyori');
      // renderer で narrowing してから cubismParams を参照する
      expect(entry.render.renderer).toBe('live2d');
      if (entry.render.renderer === 'live2d') {
        expect(entry.render.cubismParams.mouthOpenY).toBe('ParamMouthOpenY');
      }
    });

    it('"ageha" を指定すると定義と描画設定の両方を返す', () => {
      const entry = getCharacterEntry('ageha');
      expect(entry.definition.id).toBe('ageha');
      expect(entry.definition.displayName).toBe('早瀬アゲハ');
      // ageha は sprite renderer（瞬き＋口パク対応パーツ描画）を使用する
      expect(entry.render.renderer).toBe('sprite');
    });

    it('未登録の characterId を指定すると日本語定数メッセージで Error をスローする', () => {
      expect(() => getCharacterEntry('unknown')).toThrow(
        CHARACTER_REGISTRY_ERROR_MESSAGES.UNKNOWN_CHARACTER
      );
    });

    it('エラーメッセージ定数は日本語を含む', () => {
      expect(CHARACTER_REGISTRY_ERROR_MESSAGES.UNKNOWN_CHARACTER).toMatch(/[ぁ-ん]/);
    });

    it('"toString" などプロトタイプ継承プロパティ名を渡すとスローする', () => {
      expect(() => getCharacterEntry('toString')).toThrow(
        CHARACTER_REGISTRY_ERROR_MESSAGES.UNKNOWN_CHARACTER
      );
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

    it('"ageha" を指定すると早瀬アゲハの CharacterDefinition を返す', () => {
      const definition = getCharacterDefinition('ageha');
      expect(definition.id).toBe('ageha');
      expect(definition.displayName).toBe('早瀬アゲハ');
      expect(definition.voiceConfig.provider).toBe('openai');
      if (definition.voiceConfig.provider === 'openai') {
        expect(definition.voiceConfig.voice).toBe('nova');
      }
      expect(definition.personality).toBeDefined();
      expect(definition.license).toBeDefined();
    });

    it('未登録の id を指定するとスローする', () => {
      expect(() => getCharacterDefinition('unknown')).toThrow(
        CHARACTER_REGISTRY_ERROR_MESSAGES.UNKNOWN_CHARACTER
      );
    });
  });

  describe('hasCharacter', () => {
    it('"hiyori" は登録済みなので true を返す', () => {
      expect(hasCharacter('hiyori')).toBe(true);
    });

    it('"ageha" は登録済みなので true を返す', () => {
      expect(hasCharacter('ageha')).toBe(true);
    });

    it('未登録の id は false を返す', () => {
      expect(hasCharacter('unknown')).toBe(false);
    });

    it('空文字列は false を返す', () => {
      expect(hasCharacter('')).toBe(false);
    });

    it('Object.prototype のプロパティ名（toString 等）は false を返す', () => {
      // ブラケットアクセス由来の継承プロパティ取りこぼしを防ぐ
      expect(hasCharacter('toString')).toBe(false);
      expect(hasCharacter('constructor')).toBe(false);
    });
  });

  describe('core 定義とクライアントプロファイルの同期', () => {
    it('クライアント側の既定 ID は core の DEFAULT_CHARACTER_ID と一致する', () => {
      // client-profiles.ts は core バレルを import できないため定数を複製している。
      // 値がずれていないことをここで担保する。
      expect(DEFAULT_CLIENT_CHARACTER_ID).toBe(DEFAULT_CHARACTER_ID);
    });

    it('登録済みの全キャラクター定義に対応するクライアントプロファイルが存在する', () => {
      for (const id of getRegisteredCharacterIds()) {
        expect(hasCharacterProfile(id)).toBe(true);
      }
    });

    it('登録済みの全キャラクターについて、client の displayName が core の定義と一致する', () => {
      for (const id of getRegisteredCharacterIds()) {
        const clientDisplay = getCharacterDisplay(id);
        const coreDefinition = getCharacterDefinition(id);
        expect(clientDisplay.displayName).toBe(coreDefinition.displayName);
      }
    });
  });
});
