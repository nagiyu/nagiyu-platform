import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { TopicMapper } from '../../../src/mappers/topic.mapper.js';
import type { TopicEntity } from '../../../src/entities/topic.entity.js';

const TIMESTAMP = 1_700_000_000_000;
const KEY = { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-001' };

function buildEntity(overrides: Partial<TopicEntity> = {}): TopicEntity {
  return {
    userId: 'u1',
    characterId: 'hiyori',
    topicId: 'TOPIC-001',
    subject: 'コーヒー',
    canonicalSummary: 'コーヒーが好き',
    category: '飲み物',
    care: 3,
    embedding: [0.1, 0.2],
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#u1',
    SK: 'CHAR#hiyori#TOPIC#TOPIC-001#META',
    Type: 'Topic',
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: 'TOPIC-001',
    Subject: 'コーヒー',
    CanonicalSummary: 'コーヒーが好き',
    Category: '飲み物',
    Care: 3,
    Embedding: [0.1, 0.2],
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    GSI3PK: 'hiyori#TOPICS#u1',
    GSI3SK: 3,
    ...overrides,
  };
}

describe('TopicMapper', () => {
  const mapper = new TopicMapper();

  it('entityType は Topic になる', () => {
    expect(mapper.entityType).toBe('Topic');
  });

  it('buildKeys は PK=USER#<userId> / SK=CHAR#<charId>#TOPIC#<topicId>#META を PK 先頭の順で返す', () => {
    const keys = mapper.buildKeys(KEY);

    expect(keys).toEqual({ PK: 'USER#u1', SK: 'CHAR#hiyori#TOPIC#TOPIC-001#META' });
    expect(Object.keys(keys)).toEqual(['PK', 'SK']);
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildEntity())).toEqual(KEY);
  });

  describe('toItem', () => {
    it('保存形式 (PascalCase・キー・Type・GSI3) の Item に変換する', () => {
      expect(mapper.toItem(buildEntity())).toEqual(buildItem());
    });

    it('GSI3SK は care と同じ値になる', () => {
      expect(mapper.toItem(buildEntity({ care: 10 }))).toMatchObject({ Care: 10, GSI3SK: 10 });
    });

    it('依頼フックがあれば RequestText / RequestedAt を書き、なければ書かない', () => {
      expect(mapper.toItem(buildEntity())).not.toHaveProperty('RequestText');
      expect(mapper.toItem(buildEntity())).not.toHaveProperty('RequestedAt');
      expect(
        mapper.toItem(buildEntity({ requestText: '調べて', requestedAt: TIMESTAMP }))
      ).toMatchObject({ RequestText: '調べて', RequestedAt: TIMESTAMP });
    });
  });

  describe('toUpdateAttributes', () => {
    it('GSI3PK を key から付け直し、care を変えるときは GSI3SK も揃える', () => {
      expect(mapper.toUpdateAttributes({ care: 7 }, KEY)).toEqual({
        Care: 7,
        GSI3PK: 'hiyori#TOPICS#u1',
        GSI3SK: 7,
      });
    });

    it('care を変えないときは GSI3SK を付け直さない', () => {
      const attributes = mapper.toUpdateAttributes({ subject: '紅茶' }, KEY);

      expect(attributes).toEqual({ Subject: '紅茶', GSI3PK: 'hiyori#TOPICS#u1' });
      expect(attributes.Care).toBeUndefined();
      expect(attributes.GSI3SK).toBeUndefined();
    });

    it('依頼フックを null にすると属性を削除する', () => {
      expect(
        mapper.toUpdateAttributes({ requestText: null, requestedAt: null }, KEY)
      ).toMatchObject({ RequestText: REMOVE_ATTRIBUTE, RequestedAt: REMOVE_ATTRIBUTE });
    });

    it.each(['subject', 'canonicalSummary', 'category', 'care', 'embedding'] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null }, KEY)).toThrow(
          InvalidEntityDataError
        );
      }
    );

    it.each([
      ['userId', { userId: 'u1' }],
      ['characterId', { characterId: 'hiyori' }],
      ['topicId', { topicId: 'TOPIC-001' }],
      ['createdAt', { createdAt: TIMESTAMP }],
    ] as const)(
      '変更不可の項目 %s を含めると、値が同じでも InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes, KEY)).toThrow(InvalidEntityDataError);
      }
    );
  });

  describe('toEntity', () => {
    it('Item を camelCase の Entity に変換する', () => {
      expect(mapper.toEntity(buildItem())).toEqual(buildEntity());
    });

    it('依頼フックがあれば読む', () => {
      const entity = mapper.toEntity(buildItem({ RequestText: '調べて', RequestedAt: TIMESTAMP }));

      expect(entity.requestText).toBe('調べて');
      expect(entity.requestedAt).toBe(TIMESTAMP);
    });

    it('旧形式の時刻 (ISO 文字列・エポック秒) をミリ秒で読む', () => {
      const entity = mapper.toEntity(
        buildItem({ CreatedAt: new Date(TIMESTAMP).toISOString(), UpdatedAt: TIMESTAMP / 1000 })
      );

      expect(entity.createdAt).toBe(TIMESTAMP);
      expect(entity.updatedAt).toBe(TIMESTAMP);
    });

    it('GSI3 の射影には Care が無いため GSI3SK から復元し、依頼フックは持たない', () => {
      const projected = buildItem();
      delete projected.Care;
      delete projected.PK;
      delete projected.SK;
      delete projected.Type;

      const entity = mapper.toEntity(projected);

      expect(entity.care).toBe(3);
      expect(entity).not.toHaveProperty('requestText');
      expect(entity).not.toHaveProperty('requestedAt');
    });

    it('canonicalSummary は空文字を許可する', () => {
      expect(mapper.toEntity(buildItem({ CanonicalSummary: '' })).canonicalSummary).toBe('');
    });

    it('Embedding が数値配列でなければ InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ Embedding: ['a'] }))).toThrow(
        InvalidEntityDataError
      );
      expect(() => mapper.toEntity(buildItem({ Embedding: 'x' }))).toThrow(InvalidEntityDataError);
    });

    it.each([
      'UserID',
      'CharacterID',
      'TopicID',
      'Subject',
      'Category',
      'Embedding',
      'CreatedAt',
      'UpdatedAt',
    ])('必須フィールド %s が欠けている場合は InvalidEntityDataError をスローする', (field) => {
      const item = buildItem();
      delete item[field];

      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });

    it('Care も GSI3SK も無ければ InvalidEntityDataError をスローする', () => {
      const item = buildItem();
      delete item.Care;
      delete item.GSI3SK;

      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });
  });

  it('Entity -> Item -> Entity の変換で元に戻る', () => {
    const original = buildEntity({ requestText: '調べて', requestedAt: TIMESTAMP });

    expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
  });
});
