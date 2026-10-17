import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { CharacterStateMapper } from '../../../src/mappers/character-state.mapper.js';
import type { CharacterStateEntity } from '../../../src/entities/character-state.entity.js';

const TIMESTAMP = 1_700_000_000_000;

function buildEntity(overrides: Partial<CharacterStateEntity> = {}): CharacterStateEntity {
  return {
    userId: 'google-12345',
    characterId: 'hiyori',
    lastInteractionAt: TIMESTAMP,
    affectionLevel: 3.5,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#google-12345',
    SK: 'CHAR#hiyori#STATE',
    Type: 'CharacterState',
    UserID: 'google-12345',
    CharacterID: 'hiyori',
    LastInteractionAt: TIMESTAMP,
    AffectionLevel: 3.5,
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('CharacterStateMapper', () => {
  const mapper = new CharacterStateMapper();

  it('entityType は CharacterState になる', () => {
    expect(mapper.entityType).toBe('CharacterState');
  });

  it('buildKeys は PK=USER#<userId> / SK=CHAR#<characterId>#STATE を PK 先頭の順で返す', () => {
    const keys = mapper.buildKeys({ userId: 'google-12345', characterId: 'hiyori' });

    expect(keys).toEqual({ PK: 'USER#google-12345', SK: 'CHAR#hiyori#STATE' });
    expect(Object.keys(keys)).toEqual(['PK', 'SK']);
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildEntity())).toEqual({
      userId: 'google-12345',
      characterId: 'hiyori',
    });
  });

  describe('toItem', () => {
    it('保存形式 (PascalCase・キー・Type) の Item に変換する', () => {
      expect(mapper.toItem(buildEntity())).toEqual(buildItem());
    });

    it('affectionLevel を省略すると 0 を書く', () => {
      expect(mapper.toItem(buildEntity({ affectionLevel: undefined })).AffectionLevel).toBe(0);
    });

    it('Onboarded など未定義フィールドは保持しない', () => {
      expect(mapper.toItem(buildEntity()).Onboarded).toBeUndefined();
    });
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目だけを保存用の属性名に変換する', () => {
      const attributes = mapper.toUpdateAttributes({
        lastInteractionAt: TIMESTAMP + 1,
        affectionLevel: 7,
      });

      expect(attributes).toEqual({ LastInteractionAt: TIMESTAMP + 1, AffectionLevel: 7 });
    });

    it('任意項目 affectionLevel を null にすると属性の削除になる', () => {
      expect(mapper.toUpdateAttributes({ affectionLevel: null }).AffectionLevel).toBe(
        REMOVE_ATTRIBUTE
      );
    });

    it('必須項目 lastInteractionAt を null にすると InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toUpdateAttributes({ lastInteractionAt: null })).toThrow(
        InvalidEntityDataError
      );
    });

    it.each([
      ['userId', { userId: 'google-12345' }],
      ['characterId', { characterId: 'hiyori' }],
      ['createdAt', { createdAt: TIMESTAMP }],
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

    it('AffectionLevel がない Item は affectionLevel=0 になる', () => {
      const item = buildItem();
      delete item.AffectionLevel;

      expect(mapper.toEntity(item).affectionLevel).toBe(0);
    });

    it('時刻が ISO 文字列で保存された旧形式のデータもミリ秒で読める', () => {
      const entity = mapper.toEntity(
        buildItem({
          LastInteractionAt: new Date(TIMESTAMP).toISOString(),
          CreatedAt: new Date(TIMESTAMP).toISOString(),
          UpdatedAt: new Date(TIMESTAMP).toISOString(),
        })
      );

      expect(entity.lastInteractionAt).toBe(TIMESTAMP);
      expect(entity.createdAt).toBe(TIMESTAMP);
      expect(entity.updatedAt).toBe(TIMESTAMP);
    });

    it.each(['UserID', 'CharacterID', 'LastInteractionAt', 'CreatedAt', 'UpdatedAt'])(
      '必須フィールド %s が欠けている場合は InvalidEntityDataError をスローする',
      (field) => {
        const item = buildItem();
        delete item[field];

        expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
      }
    );
  });

  it('Entity -> Item -> Entity の変換で元に戻る', () => {
    const original = buildEntity();

    expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
  });
});
