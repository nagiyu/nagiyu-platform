import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { WebFactMapper } from '../../../src/mappers/web-fact.mapper.js';
import type { WebFactEntity } from '../../../src/entities/web-fact.entity.js';

const TIMESTAMP = 1_700_000_000_000;
const KEY = { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-001', factId: 'F1' };

function buildEntity(overrides: Partial<WebFactEntity> = {}): WebFactEntity {
  return {
    userId: 'u1',
    characterId: 'hiyori',
    topicId: 'TOPIC-001',
    factId: 'F1',
    text: '新作コーヒーが発売された',
    sourceUrls: ['https://example.com'],
    volatility: 'high',
    observedAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#u1',
    SK: 'CHAR#hiyori#TOPIC#TOPIC-001#WEB#F1',
    Type: 'WebFact',
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: 'TOPIC-001',
    FactID: 'F1',
    Text: '新作コーヒーが発売された',
    SourceUrls: ['https://example.com'],
    Volatility: 'high',
    ObservedAt: TIMESTAMP,
    CreatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('WebFactMapper', () => {
  const mapper = new WebFactMapper();

  it('entityType は WebFact になる', () => {
    expect(mapper.entityType).toBe('WebFact');
  });

  it('buildKeys は PK=USER#<userId> / SK=CHAR#<charId>#TOPIC#<topicId>#WEB#<factId> を返す', () => {
    const keys = mapper.buildKeys(KEY);

    expect(keys).toEqual({ PK: 'USER#u1', SK: 'CHAR#hiyori#TOPIC#TOPIC-001#WEB#F1' });
    expect(Object.keys(keys)).toEqual(['PK', 'SK']);
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildEntity())).toEqual(KEY);
  });

  describe('toItem', () => {
    it('nextReview がなければ GSI4 属性を付けない (sparse)', () => {
      const item = mapper.toItem(buildEntity({ volatility: 'stable' }));

      expect(item).toEqual(buildItem({ Volatility: 'stable' }));
      expect(item).not.toHaveProperty('NextReview');
      expect(item).not.toHaveProperty('GSI4PK');
      expect(item).not.toHaveProperty('GSI4SK');
      expect(item).not.toHaveProperty('UpdatedAt');
    });

    it('nextReview があれば NextReview と GSI4PK / GSI4SK を付ける', () => {
      expect(mapper.toItem(buildEntity({ nextReview: TIMESTAMP + 5 }))).toEqual(
        buildItem({
          NextReview: TIMESTAMP + 5,
          GSI4PK: 'hiyori#STALE#u1',
          GSI4SK: TIMESTAMP + 5,
        })
      );
    });
  });

  describe('toUpdateAttributes', () => {
    it('nextReview を変えるときは NextReview と GSI4PK / GSI4SK を key から付け直す', () => {
      expect(mapper.toUpdateAttributes({ nextReview: TIMESTAMP + 9 }, KEY)).toEqual({
        NextReview: TIMESTAMP + 9,
        GSI4PK: 'hiyori#STALE#u1',
        GSI4SK: TIMESTAMP + 9,
      });
    });

    it('nextReview を null にすると NextReview と GSI4 属性を削除する', () => {
      expect(mapper.toUpdateAttributes({ nextReview: null }, KEY)).toEqual({
        NextReview: REMOVE_ATTRIBUTE,
        GSI4PK: REMOVE_ATTRIBUTE,
        GSI4SK: REMOVE_ATTRIBUTE,
      });
    });

    it('nextReview を変えないときは GSI4 属性に触れない', () => {
      const attributes = mapper.toUpdateAttributes({ text: '更新' }, KEY);

      expect(attributes.Text).toBe('更新');
      expect(attributes.NextReview).toBeUndefined();
      expect(attributes.GSI4PK).toBeUndefined();
      expect(attributes.GSI4SK).toBeUndefined();
    });

    it.each(['text', 'sourceUrls', 'volatility', 'observedAt'] as const)(
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
      ['factId', { factId: 'F1' }],
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
      expect(mapper.toEntity(buildItem({ NextReview: 5 }))).toEqual(buildEntity({ nextReview: 5 }));
    });

    it('NextReview がなければ nextReview を持たない', () => {
      expect(mapper.toEntity(buildItem())).not.toHaveProperty('nextReview');
    });

    it('GSI4 の射影には NextReview が無いため GSI4SK から復元する', () => {
      expect(mapper.toEntity(buildItem({ GSI4PK: 'hiyori#STALE#u1', GSI4SK: 7 })).nextReview).toBe(
        7
      );
    });

    it('sourceUrls が配列でなければ空配列にする', () => {
      expect(mapper.toEntity(buildItem({ SourceUrls: undefined })).sourceUrls).toEqual([]);
    });

    it('旧形式の createdAt (ISO 文字列・エポック秒) をミリ秒で読む', () => {
      expect(
        mapper.toEntity(buildItem({ CreatedAt: new Date(TIMESTAMP).toISOString() })).createdAt
      ).toBe(TIMESTAMP);
      expect(mapper.toEntity(buildItem({ CreatedAt: TIMESTAMP / 1000 })).createdAt).toBe(TIMESTAMP);
    });

    it('Volatility が不正な場合は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ Volatility: 'unknown' }))).toThrow(
        InvalidEntityDataError
      );
    });

    it.each([
      'UserID',
      'CharacterID',
      'TopicID',
      'FactID',
      'Text',
      'Volatility',
      'ObservedAt',
      'CreatedAt',
    ])('必須フィールド %s が欠けている場合は InvalidEntityDataError をスローする', (field) => {
      const item = buildItem();
      delete item[field];

      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });
  });

  it('Entity -> Item -> Entity の変換で元に戻る', () => {
    const original = buildEntity({ nextReview: TIMESTAMP + 5 });

    expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
  });
});
