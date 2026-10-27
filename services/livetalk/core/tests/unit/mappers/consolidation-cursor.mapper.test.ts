import { InvalidEntityDataError } from '@nagiyu/aws';
import { ConsolidationCursorMapper } from '../../../src/mappers/consolidation-cursor.mapper.js';
import type { ConsolidationCursorEntity } from '../../../src/entities/consolidation-cursor.entity.js';

const TIMESTAMP = 1_700_000_000_000;
const KEY = { userId: 'u1', characterId: 'hiyori' };

function buildEntity(
  overrides: Partial<ConsolidationCursorEntity> = {}
): ConsolidationCursorEntity {
  return {
    userId: 'u1',
    characterId: 'hiyori',
    msgCursor: 100,
    webrawCursor: 50,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#u1',
    SK: 'CHAR#hiyori#CURSOR',
    Type: 'ConsolidationCursor',
    UserID: 'u1',
    CharacterID: 'hiyori',
    MsgCursor: 100,
    WebrawCursor: 50,
    UpdatedAt: TIMESTAMP,
    CreatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('ConsolidationCursorMapper', () => {
  const mapper = new ConsolidationCursorMapper();

  it('entityType は ConsolidationCursor になる', () => {
    expect(mapper.entityType).toBe('ConsolidationCursor');
  });

  it('buildKeys は PK=USER#<userId> / SK=CHAR#<charId>#CURSOR を PK 先頭の順で返す', () => {
    const keys = mapper.buildKeys(KEY);

    expect(keys).toEqual({ PK: 'USER#u1', SK: 'CHAR#hiyori#CURSOR' });
    expect(Object.keys(keys)).toEqual(['PK', 'SK']);
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildEntity())).toEqual(KEY);
  });

  it('toItem は保存形式の Item に変換し、CreatedAt に更新日時を複製する', () => {
    expect(mapper.toItem(buildEntity())).toEqual(buildItem());
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目だけを保存用の属性名に変換する', () => {
      expect(mapper.toUpdateAttributes({ msgCursor: 200 })).toEqual({ MsgCursor: 200 });
    });

    it.each(['msgCursor', 'webrawCursor'] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['userId', { userId: 'u1' }],
      ['characterId', { characterId: 'hiyori' }],
    ] as const)(
      '変更不可の項目 %s を含めると、値が同じでも InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes)).toThrow(InvalidEntityDataError);
      }
    );
  });

  describe('toEntity', () => {
    it('Item を camelCase の Entity に変換する', () => {
      expect(mapper.toEntity(buildItem())).toEqual(buildEntity());
    });

    it('旧形式の updatedAt (ISO 文字列・エポック秒) をミリ秒で読む', () => {
      expect(
        mapper.toEntity(buildItem({ UpdatedAt: new Date(TIMESTAMP).toISOString() })).updatedAt
      ).toBe(TIMESTAMP);
      expect(mapper.toEntity(buildItem({ UpdatedAt: TIMESTAMP / 1000 })).updatedAt).toBe(TIMESTAMP);
    });

    it('カーソルが負数の場合は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ MsgCursor: -1 }))).toThrow(InvalidEntityDataError);
    });

    it.each(['UserID', 'CharacterID', 'MsgCursor', 'WebrawCursor', 'UpdatedAt'])(
      '必須フィールド %s が欠けている場合は InvalidEntityDataError をスローする',
      (field) => {
        const item = buildItem();
        delete item[field];

        expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
      }
    );
  });

  it('Entity -> Item -> Entity の変換で元に戻る', () => {
    expect(mapper.toEntity(mapper.toItem(buildEntity()))).toEqual(buildEntity());
  });
});
