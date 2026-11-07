import { InvalidEntityDataError } from '@nagiyu/aws';
import { NoteSkipMapper } from '../../../src/mappers/note-skip.mapper.js';
import type { NoteSkipEntity } from '../../../src/entities/note-skip.entity.js';

const TIMESTAMP = 1_700_000_000_000;
const DECIDED_AT = 1_699_999_000_000;
const KEY = { userId: 'u1', characterId: 'hiyori', topicId: 'topic-1' };

function buildEntity(overrides: Partial<NoteSkipEntity> = {}): NoteSkipEntity {
  return { ...KEY, decidedAt: DECIDED_AT, updatedAt: TIMESTAMP, ...overrides };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#u1',
    SK: 'CHAR#hiyori#NOTESKIP#topic-1',
    Type: 'NoteSkip',
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: 'topic-1',
    DecidedAt: DECIDED_AT,
    UpdatedAt: TIMESTAMP,
    CreatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('NoteSkipMapper', () => {
  const mapper = new NoteSkipMapper();

  it('entityType は NoteSkip になる', () => {
    expect(mapper.entityType).toBe('NoteSkip');
  });

  it('buildKeys は Topic の束・ノート一覧のプレフィックスに混ざらない SK を返す', () => {
    const keys = mapper.buildKeys(KEY);

    expect(keys).toEqual({ PK: 'USER#u1', SK: 'CHAR#hiyori#NOTESKIP#topic-1' });
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
      expect(mapper.toUpdateAttributes({ decidedAt: 5 })).toEqual({ DecidedAt: 5 });
    });

    it('必須項目 decidedAt を null にすると InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toUpdateAttributes({ decidedAt: null })).toThrow(InvalidEntityDataError);
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

    it.each(['UserID', 'CharacterID', 'TopicID', 'DecidedAt', 'UpdatedAt'])(
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
