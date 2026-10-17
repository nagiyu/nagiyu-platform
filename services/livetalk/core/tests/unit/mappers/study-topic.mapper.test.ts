import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { StudyTopicMapper } from '../../../src/mappers/study-topic.mapper.js';
import type { StudyTopicEntity } from '../../../src/entities/study-topic.entity.js';

const TIMESTAMP = 1_700_000_000_000;

function buildEntity(overrides: Partial<StudyTopicEntity> = {}): StudyTopicEntity {
  return {
    userId: 'u1',
    characterId: 'hiyori',
    topicId: 'tp1',
    topic: 'モンスターハンター',
    priority: 10,
    status: 'pending',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#u1',
    SK: 'CHAR#hiyori#STUDY#tp1',
    Type: 'StudyTopic',
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: 'tp1',
    Topic: 'モンスターハンター',
    Priority: 10,
    Status: 'pending',
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('StudyTopicMapper', () => {
  const mapper = new StudyTopicMapper();

  it('entityType は StudyTopic になる', () => {
    expect(mapper.entityType).toBe('StudyTopic');
  });

  it('旧属性名 Ttl を TTL の旧名として宣言する', () => {
    expect(mapper.legacyAttributeNames).toEqual({ TTL: ['Ttl'] });
  });

  it('buildKeys は PK=USER#<userId> / SK=CHAR#<charId>#STUDY#<topicId> を PK 先頭の順で返す', () => {
    const keys = mapper.buildKeys({ userId: 'u1', characterId: 'hiyori', topicId: 'tp1' });

    expect(keys).toEqual({ PK: 'USER#u1', SK: 'CHAR#hiyori#STUDY#tp1' });
    expect(Object.keys(keys)).toEqual(['PK', 'SK']);
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildEntity())).toEqual({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'tp1',
    });
  });

  describe('toItem', () => {
    it('保存形式 (PascalCase・キー・Type) の Item に変換し、expiresAt がなければ TTL を書かない', () => {
      const item = mapper.toItem(buildEntity());

      expect(item).toEqual(buildItem());
      expect(item).not.toHaveProperty('TTL');
      expect(item).not.toHaveProperty('Ttl');
    });

    it('expiresAt (ミリ秒) を TTL 属性のエポック秒 (切り捨て) で書く', () => {
      const item = mapper.toItem(buildEntity({ expiresAt: 1_700_000_999_999 }));

      expect(item.TTL).toBe(1_700_000_999);
      expect(item).not.toHaveProperty('Ttl');
    });
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目だけを保存用の属性名に変換する', () => {
      expect(mapper.toUpdateAttributes({ status: 'done', priority: 3 })).toEqual({
        Status: 'done',
        Priority: 3,
      });
    });

    it('expiresAt はエポック秒に変換し、null なら TTL 属性を削除する', () => {
      expect(mapper.toUpdateAttributes({ expiresAt: 1_700_000_999_999 })).toEqual({
        TTL: 1_700_000_999,
      });
      expect(mapper.toUpdateAttributes({ expiresAt: null })).toEqual({ TTL: REMOVE_ATTRIBUTE });
    });

    it.each(['topic', 'priority', 'status'] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['userId', { userId: 'u1' }],
      ['characterId', { characterId: 'hiyori' }],
      ['topicId', { topicId: 'tp1' }],
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

    it('旧形式の時刻 (ISO 文字列・エポック秒) をミリ秒で読む', () => {
      const entity = mapper.toEntity(
        buildItem({ CreatedAt: new Date(TIMESTAMP).toISOString(), UpdatedAt: TIMESTAMP / 1000 })
      );

      expect(entity.createdAt).toBe(TIMESTAMP);
      expect(entity.updatedAt).toBe(TIMESTAMP);
    });

    it('TTL 属性のエポック秒をミリ秒の expiresAt に戻す', () => {
      expect(mapper.toEntity(buildItem({ TTL: 1_700_000_999 })).expiresAt).toBe(1_700_000_999_000);
    });

    it('旧属性名 Ttl だけの Item も expiresAt として読む', () => {
      expect(mapper.toEntity(buildItem({ Ttl: 1_700_000_111 })).expiresAt).toBe(1_700_000_111_000);
    });

    it('新名 TTL と旧名 Ttl が両方あれば新名を優先する', () => {
      const entity = mapper.toEntity(buildItem({ TTL: 1_700_000_999, Ttl: 1_700_000_111 }));

      expect(entity.expiresAt).toBe(1_700_000_999_000);
    });

    it('TTL がどちらの名前でもなければ expiresAt を持たない', () => {
      expect(mapper.toEntity(buildItem())).not.toHaveProperty('expiresAt');
    });

    it('Status が不正な場合は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ Status: 'unknown' }))).toThrow(
        InvalidEntityDataError
      );
    });

    it.each([
      'UserID',
      'CharacterID',
      'TopicID',
      'Topic',
      'Priority',
      'Status',
      'CreatedAt',
      'UpdatedAt',
    ])('必須フィールド %s が欠けている場合は InvalidEntityDataError をスローする', (field) => {
      const item = buildItem();
      delete item[field];

      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });
  });

  it('Entity -> Item -> Entity の変換で元に戻る', () => {
    const original = buildEntity({ expiresAt: 1_700_000_999_000 });

    expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
  });
});
