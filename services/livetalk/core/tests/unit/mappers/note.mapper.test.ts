import { InvalidEntityDataError } from '@nagiyu/aws';
import { NoteMapper } from '../../../src/mappers/note.mapper.js';
import type { NoteEntity } from '../../../src/entities/note.entity.js';

const baseEntity: NoteEntity = {
  UserID: 'user1',
  CharacterID: 'hiyori',
  NoteID: 'NOTE-001',
  TopicID: 'topic-001',
  Subject: 'コーヒーの効能',
  Headline: 'この前コーヒーの話をしてたよね、気になって調べてみたよ。覚醒効果があるみたい！',
  CreatedAt: 1_750_000_000_000,
  UpdatedAt: 1_750_086_400_000,
};

describe('NoteMapper', () => {
  let mapper: NoteMapper;

  beforeEach(() => {
    mapper = new NoteMapper();
  });

  describe('toItem', () => {
    it('エンティティを DynamoDB Item に変換する', () => {
      const item = mapper.toItem(baseEntity);
      expect(item.PK).toBe('USER#user1');
      expect(item.SK).toBe('CHAR#hiyori#NOTE#NOTE-001');
      expect(item.Type).toBe('Note');
      expect(item.NoteID).toBe('NOTE-001');
      expect(item.TopicID).toBe('topic-001');
      expect(item.Subject).toBe('コーヒーの効能');
      expect(item.Headline).toBe(baseEntity.Headline);
      expect(item.CreatedAt).toBe(1_750_000_000_000);
    });

    it('Reaction 未設定時は Item に含めない', () => {
      const item = mapper.toItem(baseEntity);
      expect(item.Reaction).toBeUndefined();
      expect('Reaction' in item).toBe(false);
    });

    it('Reaction 設定時は Item に含める', () => {
      const item = mapper.toItem({ ...baseEntity, Reaction: 'すごく良かった！' });
      expect(item.Reaction).toBe('すごく良かった！');
    });
  });

  describe('toEntity', () => {
    it('DynamoDB Item をエンティティに復元する', () => {
      const item = mapper.toItem(baseEntity);
      const entity = mapper.toEntity(item);
      expect(entity).toEqual(baseEntity);
    });

    it('Reaction を復元する', () => {
      const item = mapper.toItem({ ...baseEntity, Reaction: '嬉しい' });
      const entity = mapper.toEntity(item);
      expect(entity.Reaction).toBe('嬉しい');
    });

    it('必須フィールド欠落で InvalidEntityDataError を投げる', () => {
      const item = mapper.toItem(baseEntity);
      delete (item as Record<string, unknown>).Subject;
      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });

    it('TopicID 欠落で InvalidEntityDataError を投げる', () => {
      const item = mapper.toItem(baseEntity);
      delete (item as Record<string, unknown>).TopicID;
      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });

    it('Headline 欠落で InvalidEntityDataError を投げる', () => {
      const item = mapper.toItem(baseEntity);
      delete (item as Record<string, unknown>).Headline;
      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });
  });

  describe('buildKeys', () => {
    it('PK / SK を組み立てる', () => {
      const { pk, sk } = mapper.buildKeys({
        userId: 'user1',
        characterId: 'hiyori',
        noteId: 'NOTE-001',
      });
      expect(pk).toBe('USER#user1');
      expect(sk).toBe('CHAR#hiyori#NOTE#NOTE-001');
    });
  });
});
