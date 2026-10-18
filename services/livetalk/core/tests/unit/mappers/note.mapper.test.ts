import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { NoteMapper } from '../../../src/mappers/note.mapper.js';
import type { NoteEntity } from '../../../src/entities/note.entity.js';

const TIMESTAMP = 1_700_000_000_000;

function buildEntity(overrides: Partial<NoteEntity> = {}): NoteEntity {
  return {
    userId: 'u1',
    characterId: 'hiyori',
    noteId: '01J9Z000000000000000000001',
    topicId: 'topic-1',
    subject: 'コーヒーの効能',
    headline: '調べてみたよ',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#u1',
    SK: 'CHAR#hiyori#NOTE#01J9Z000000000000000000001',
    Type: 'Note',
    UserID: 'u1',
    CharacterID: 'hiyori',
    NoteID: '01J9Z000000000000000000001',
    TopicID: 'topic-1',
    Subject: 'コーヒーの効能',
    Headline: '調べてみたよ',
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('NoteMapper', () => {
  const mapper = new NoteMapper();

  it('entityType は Note になる', () => {
    expect(mapper.entityType).toBe('Note');
  });

  it('buildKeys は PK=USER#<userId> / SK=CHAR#<charId>#NOTE#<ulid> を PK 先頭の順で返す', () => {
    const keys = mapper.buildKeys({ userId: 'u1', characterId: 'hiyori', noteId: '01J9Z' });

    expect(keys).toEqual({ PK: 'USER#u1', SK: 'CHAR#hiyori#NOTE#01J9Z' });
    expect(Object.keys(keys)).toEqual(['PK', 'SK']);
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildEntity())).toEqual({
      userId: 'u1',
      characterId: 'hiyori',
      noteId: '01J9Z000000000000000000001',
    });
  });

  describe('toItem', () => {
    it('保存形式の Item に変換し、reaction がなければ Reaction を書かない', () => {
      const item = mapper.toItem(buildEntity());

      expect(item).toEqual(buildItem());
      expect(item).not.toHaveProperty('Reaction');
    });

    it('reaction があれば Reaction を書く', () => {
      expect(mapper.toItem(buildEntity({ reaction: '良かった' })).Reaction).toBe('良かった');
    });
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目だけを保存用の属性名に変換する', () => {
      expect(mapper.toUpdateAttributes({ reaction: '良かった' })).toEqual({
        Reaction: '良かった',
      });
    });

    it('reaction が null なら Reaction 属性を削除する', () => {
      expect(mapper.toUpdateAttributes({ reaction: null })).toEqual({
        Reaction: REMOVE_ATTRIBUTE,
      });
    });

    it.each(['topicId', 'subject', 'headline'] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['userId', { userId: 'u1' }],
      ['characterId', { characterId: 'hiyori' }],
      ['noteId', { noteId: '01J9Z' }],
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

    it('Reaction があれば reaction に読む', () => {
      expect(mapper.toEntity(buildItem({ Reaction: '良かった' })).reaction).toBe('良かった');
    });

    it('旧形式の時刻 (ISO 文字列・エポック秒) をミリ秒で読む', () => {
      const entity = mapper.toEntity(
        buildItem({ CreatedAt: new Date(TIMESTAMP).toISOString(), UpdatedAt: TIMESTAMP / 1000 })
      );

      expect(entity.createdAt).toBe(TIMESTAMP);
      expect(entity.updatedAt).toBe(TIMESTAMP);
    });

    it.each([
      'UserID',
      'CharacterID',
      'NoteID',
      'TopicID',
      'Subject',
      'Headline',
      'CreatedAt',
      'UpdatedAt',
    ])('必須フィールド %s が欠けている場合は InvalidEntityDataError をスローする', (field) => {
      const item = buildItem();
      delete item[field];

      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });

    it('旧設計の Note (Title/Body) は InvalidEntityDataError をスローする', () => {
      const legacy = buildItem();
      delete legacy.TopicID;
      delete legacy.Subject;
      delete legacy.Headline;

      expect(() => mapper.toEntity({ ...legacy, Title: 't', Body: 'b' })).toThrow(
        InvalidEntityDataError
      );
    });
  });

  it('Entity -> Item -> Entity の変換で元に戻る', () => {
    const original = buildEntity({ reaction: '良かった' });

    expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
  });
});
