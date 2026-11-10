import { InvalidEntityDataError } from '@nagiyu/aws';
import { ExplorationMapper } from '../../../src/mappers/exploration.mapper.js';
import type { ExplorationEntity } from '../../../src/entities/exploration.entity.js';

const TIMESTAMP = 1_700_000_000_000;
const EXPLORED_AT = 1_699_999_000_000;
const KEY = { userId: 'u1', characterId: 'hiyori', topicId: 'topic-1' };

function buildEntity(overrides: Partial<ExplorationEntity> = {}): ExplorationEntity {
  return {
    ...KEY,
    exploredAt: EXPLORED_AT,
    recentAngles: ['ボカロ ライブ 2026'],
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#u1',
    SK: 'CHAR#hiyori#EXPLORE#topic-1',
    Type: 'Exploration',
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: 'topic-1',
    ExploredAt: EXPLORED_AT,
    RecentAngles: ['ボカロ ライブ 2026'],
    UpdatedAt: TIMESTAMP,
    CreatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('ExplorationMapper', () => {
  const mapper = new ExplorationMapper();

  it('entityType は Exploration になる', () => {
    expect(mapper.entityType).toBe('Exploration');
  });

  it('buildKeys は Topic の束・ノート一覧のプレフィックスに混ざらない SK を返す', () => {
    const keys = mapper.buildKeys(KEY);

    expect(keys).toEqual({ PK: 'USER#u1', SK: 'CHAR#hiyori#EXPLORE#topic-1' });
    expect(String(keys.SK).startsWith('CHAR#hiyori#TOPIC#topic-1#')).toBe(false);
    expect(String(keys.SK).startsWith('CHAR#hiyori#NOTE#')).toBe(false);
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildEntity())).toEqual(KEY);
  });

  it('toItem は保存形式の Item に変換する', () => {
    expect(mapper.toItem(buildEntity())).toEqual(buildItem());
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目だけを保存用の属性名に変換する', () => {
      expect(mapper.toUpdateAttributes({ exploredAt: 5 })).toEqual({ ExploredAt: 5 });
    });

    it('最近の角度を保存用の属性名に変換する', () => {
      expect(mapper.toUpdateAttributes({ recentAngles: ['a'] })).toEqual({ RecentAngles: ['a'] });
    });

    it('必須項目 exploredAt を null にすると InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toUpdateAttributes({ exploredAt: null })).toThrow(InvalidEntityDataError);
    });

    it.each([
      ['userId', { userId: 'u1' }],
      ['characterId', { characterId: 'hiyori' }],
      ['topicId', { topicId: 'topic-1' }],
    ] as const)(
      '変更不可の項目 %s を含めると InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes)).toThrow(InvalidEntityDataError);
      }
    );
  });

  describe('toEntity', () => {
    it('Item を camelCase の Entity に変換する', () => {
      expect(mapper.toEntity(buildItem())).toEqual(buildEntity());
    });

    it.each(['UserID', 'CharacterID', 'TopicID', 'ExploredAt', 'RecentAngles', 'UpdatedAt'])(
      '必須フィールド %s が欠けている場合は InvalidEntityDataError をスローする',
      (field) => {
        const item = buildItem();
        delete item[field];

        expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
      }
    );
  });

  it('最近の角度が配列でない、または文字列以外を含む場合は InvalidEntityDataError をスローする', () => {
    expect(() => mapper.toEntity(buildItem({ RecentAngles: 'a' }))).toThrow(InvalidEntityDataError);
    expect(() => mapper.toEntity(buildItem({ RecentAngles: [1] }))).toThrow(InvalidEntityDataError);
  });

  it('Entity -> Item -> Entity の変換で元に戻る', () => {
    expect(mapper.toEntity(mapper.toItem(buildEntity()))).toEqual(buildEntity());
  });
});
