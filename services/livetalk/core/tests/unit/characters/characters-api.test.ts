import {
  CHARACTER_DEFINITIONS,
  getAllCharacterIds,
  getCharacterDefinitionById,
} from '../../../src/characters/index.js';
import { DEFAULT_CHARACTER_ID } from '../../../src/constants.js';

/**
 * Phase A (#3491) で追加した全キャラ ID 一覧 API の単体テスト。
 */
describe('CHARACTER_DEFINITIONS', () => {
  it('hiyori と ageha の 2 キャラが定義されている', () => {
    const ids = CHARACTER_DEFINITIONS.map((c) => c.id);
    expect(ids).toContain('hiyori');
    expect(ids).toContain('ageha');
  });

  it('各エントリは id・displayName・notificationName・personality・voiceConfig・license を持つ', () => {
    for (const def of CHARACTER_DEFINITIONS) {
      expect(def.id).toBeTruthy();
      expect(def.displayName).toBeTruthy();
      // notificationName は通知タイトル用のカジュアル名（必須フィールド）
      expect(def.notificationName).toBeTruthy();
      expect(def.personality).toBeTruthy();
      expect(def.voiceConfig).toBeTruthy();
      expect(def.license).toBeTruthy();
    }
  });

  it('hiyori の notificationName が "ひより" である', () => {
    const hiyoriDef = CHARACTER_DEFINITIONS.find((c) => c.id === 'hiyori');
    expect(hiyoriDef?.notificationName).toBe('ひより');
  });

  it('ageha の notificationName が "アゲハ" である', () => {
    const agehaDef = CHARACTER_DEFINITIONS.find((c) => c.id === 'ageha');
    expect(agehaDef?.notificationName).toBe('アゲハ');
  });

  it('全キャラの notificationName が空でない文字列である', () => {
    for (const def of CHARACTER_DEFINITIONS) {
      expect(typeof def.notificationName).toBe('string');
      expect(def.notificationName.length).toBeGreaterThan(0);
    }
  });
});

describe('getAllCharacterIds', () => {
  it('登録済み全キャラの ID を配列で返す', () => {
    const ids = getAllCharacterIds();
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThanOrEqual(2);
  });

  it('hiyori と ageha が含まれる', () => {
    const ids = getAllCharacterIds();
    expect(ids).toContain('hiyori');
    expect(ids).toContain('ageha');
  });

  it('DEFAULT_CHARACTER_ID（hiyori）が含まれる', () => {
    const ids = getAllCharacterIds();
    expect(ids).toContain(DEFAULT_CHARACTER_ID);
  });

  it('返り値は string[] である', () => {
    const ids = getAllCharacterIds();
    for (const id of ids) {
      expect(typeof id).toBe('string');
    }
  });
});

describe('getCharacterDefinitionById', () => {
  it('hiyori の定義を返す', () => {
    const def = getCharacterDefinitionById('hiyori');
    expect(def).toBeDefined();
    expect(def?.id).toBe('hiyori');
    expect(def?.displayName).toBe('桃瀬ひより');
  });

  it('ageha の定義を返す', () => {
    const def = getCharacterDefinitionById('ageha');
    expect(def).toBeDefined();
    expect(def?.id).toBe('ageha');
    expect(def?.displayName).toBe('早瀬アゲハ');
  });

  it('存在しない ID は undefined を返す', () => {
    const def = getCharacterDefinitionById('nonexistent-char');
    expect(def).toBeUndefined();
  });

  it('DEFAULT_CHARACTER_ID で定義を取得できる', () => {
    const def = getCharacterDefinitionById(DEFAULT_CHARACTER_ID);
    expect(def).toBeDefined();
    expect(def?.id).toBe(DEFAULT_CHARACTER_ID);
  });

  it('取得したキャラの displayName が空でない', () => {
    const allIds = getAllCharacterIds();
    for (const id of allIds) {
      const def = getCharacterDefinitionById(id);
      expect(def?.displayName.length).toBeGreaterThan(0);
    }
  });
});
