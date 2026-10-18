import { InvalidEntityDataError } from '@nagiyu/aws';
import { SelfFactMapper } from '../../../src/mappers/self-fact.mapper.js';
import type { SelfFactEntity } from '../../../src/entities/self-fact.entity.js';

const TIMESTAMP = 1_700_000_000_000;
const KEY = { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-001', factId: 'F1' };

function buildEntity(overrides: Partial<SelfFactEntity> = {}): SelfFactEntity {
  return {
    userId: 'u1',
    characterId: 'hiyori',
    topicId: 'TOPIC-001',
    factId: 'F1',
    text: 'ユーザーはコーヒーが好き',
    provenance: 'MSG-1',
    createdAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#u1',
    SK: 'CHAR#hiyori#TOPIC#TOPIC-001#SELF#F1',
    Type: 'SelfFact',
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: 'TOPIC-001',
    FactID: 'F1',
    Text: 'ユーザーはコーヒーが好き',
    Provenance: 'MSG-1',
    CreatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('SelfFactMapper', () => {
  const mapper = new SelfFactMapper();

  it('entityType は SelfFact になる', () => {
    expect(mapper.entityType).toBe('SelfFact');
  });

  it('buildKeys は PK=USER#<userId> / SK=CHAR#<charId>#TOPIC#<topicId>#SELF#<factId> を返す', () => {
    const keys = mapper.buildKeys(KEY);

    expect(keys).toEqual({ PK: 'USER#u1', SK: 'CHAR#hiyori#TOPIC#TOPIC-001#SELF#F1' });
    expect(Object.keys(keys)).toEqual(['PK', 'SK']);
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildEntity())).toEqual(KEY);
  });

  it('toItem は保存形式の Item に変換し、UpdatedAt は store に任せて書かない', () => {
    const item = mapper.toItem(buildEntity());

    expect(item).toEqual(buildItem());
    expect(item).not.toHaveProperty('UpdatedAt');
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目だけを保存用の属性名に変換する', () => {
      expect(mapper.toUpdateAttributes({ text: '更新' })).toEqual({ Text: '更新' });
    });

    it.each(['text', 'provenance'] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['userId', { userId: 'u1' }],
      ['characterId', { characterId: 'hiyori' }],
      ['topicId', { topicId: 'TOPIC-001' }],
      ['factId', { factId: 'F1' }],
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

    it('provenance は空文字を許可する', () => {
      expect(mapper.toEntity(buildItem({ Provenance: '' })).provenance).toBe('');
    });

    it('旧形式の時刻 (ISO 文字列・エポック秒) をミリ秒で読む', () => {
      expect(
        mapper.toEntity(buildItem({ CreatedAt: new Date(TIMESTAMP).toISOString() })).createdAt
      ).toBe(TIMESTAMP);
      expect(mapper.toEntity(buildItem({ CreatedAt: TIMESTAMP / 1000 })).createdAt).toBe(TIMESTAMP);
    });

    it.each(['UserID', 'CharacterID', 'TopicID', 'FactID', 'Text', 'Provenance', 'CreatedAt'])(
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
