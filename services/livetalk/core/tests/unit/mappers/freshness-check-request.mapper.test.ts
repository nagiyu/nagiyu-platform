import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { FreshnessCheckRequestMapper } from '../../../src/mappers/freshness-check-request.mapper.js';
import type { FreshnessCheckRequestEntity } from '../../../src/entities/freshness-check-request.entity.js';

const TIMESTAMP = 1_700_000_000_000;

function buildEntity(
  overrides: Partial<FreshnessCheckRequestEntity> = {}
): FreshnessCheckRequestEntity {
  return {
    userId: 'u1',
    characterId: 'hiyori',
    topicId: 'tp1',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#u1',
    SK: 'CHAR#hiyori#FRESHCHECK#tp1',
    Type: 'FreshnessCheckRequest',
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: 'tp1',
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('FreshnessCheckRequestMapper', () => {
  const mapper = new FreshnessCheckRequestMapper();

  it('buildKeys は PK=USER#<userId> / SK=CHAR#<charId>#FRESHCHECK#<topicId> を返す', () => {
    expect(mapper.buildKeys({ userId: 'u1', characterId: 'hiyori', topicId: 'tp1' })).toEqual({
      PK: 'USER#u1',
      SK: 'CHAR#hiyori#FRESHCHECK#tp1',
    });
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildEntity())).toEqual({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'tp1',
    });
  });

  describe('toItem', () => {
    it('expiresAt がなければ TTL を書かない', () => {
      const item = mapper.toItem(buildEntity());

      expect(item).toEqual(buildItem());
      expect(item).not.toHaveProperty('TTL');
    });

    it('expiresAt (ミリ秒) を TTL 属性のエポック秒で書く', () => {
      expect(mapper.toItem(buildEntity({ expiresAt: 1_700_000_999_999 })).TTL).toBe(1_700_000_999);
    });
  });

  describe('toUpdateAttributes', () => {
    it('expiresAt はエポック秒に変換し、null なら TTL 属性を削除する', () => {
      expect(mapper.toUpdateAttributes({ expiresAt: 1_700_000_999_999 })).toEqual({
        TTL: 1_700_000_999,
      });
      expect(mapper.toUpdateAttributes({ expiresAt: null })).toEqual({ TTL: REMOVE_ATTRIBUTE });
    });

    it.each([
      ['userId', { userId: 'u1' }],
      ['characterId', { characterId: 'hiyori' }],
      ['topicId', { topicId: 'tp1' }],
      ['createdAt', { createdAt: TIMESTAMP }],
    ] as const)(
      '変更不可の項目 %s を含めると InvalidEntityDataError をスローする',
      (_f, changes) => {
        expect(() => mapper.toUpdateAttributes(changes)).toThrow(InvalidEntityDataError);
      }
    );
  });

  describe('toEntity', () => {
    it('Item を Entity に変換する', () => {
      expect(mapper.toEntity(buildItem())).toEqual(buildEntity());
    });

    it('TTL 属性のエポック秒をミリ秒の expiresAt に戻す', () => {
      expect(mapper.toEntity(buildItem({ TTL: 1_700_000_999 })).expiresAt).toBe(1_700_000_999_000);
    });

    it('必須項目が欠けていれば InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ TopicID: undefined }))).toThrow(
        InvalidEntityDataError
      );
    });
  });
});
