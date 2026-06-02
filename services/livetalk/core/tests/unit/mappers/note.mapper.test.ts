import { InvalidEntityDataError } from '@nagiyu/aws';
import { NoteMapper } from '../../../src/mappers/note.mapper.js';
import type { NoteEntity } from '../../../src/entities/note.entity.js';

const baseEntity: NoteEntity = {
  UserID: 'user1',
  CharacterID: 'hiyori',
  NoteID: 'NOTE-001',
  Title: 'コーヒーの効能',
  Body: 'コーヒーには覚醒効果があります。\n\n面白いよね！',
  RelatedKnowledgeIds: ['KNOW-001', 'KNOW-002'],
  RelatedCategory: 'コーヒー',
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
      expect(item.Title).toBe('コーヒーの効能');
      expect(item.RelatedKnowledgeIds).toEqual(['KNOW-001', 'KNOW-002']);
      expect(item.RelatedCategory).toBe('コーヒー');
      expect(item.CreatedAt).toBe(1_750_000_000_000);
    });

    it('ReadAt 未設定時は Item に含めない', () => {
      const item = mapper.toItem(baseEntity);
      expect(item.ReadAt).toBeUndefined();
      expect('ReadAt' in item).toBe(false);
    });

    it('ReadAt 設定時は Item に含める', () => {
      const item = mapper.toItem({ ...baseEntity, ReadAt: 1_750_100_000_000 });
      expect(item.ReadAt).toBe(1_750_100_000_000);
    });
  });

  describe('toEntity', () => {
    it('DynamoDB Item をエンティティに復元する', () => {
      const item = mapper.toItem(baseEntity);
      const entity = mapper.toEntity(item);
      expect(entity).toEqual(baseEntity);
    });

    it('ReadAt を復元する', () => {
      const item = mapper.toItem({ ...baseEntity, ReadAt: 1_750_100_000_000 });
      const entity = mapper.toEntity(item);
      expect(entity.ReadAt).toBe(1_750_100_000_000);
    });

    it('RelatedKnowledgeIds が配列でない場合は空配列にする', () => {
      const item = mapper.toItem(baseEntity);
      delete (item as Record<string, unknown>).RelatedKnowledgeIds;
      const entity = mapper.toEntity(item);
      expect(entity.RelatedKnowledgeIds).toEqual([]);
    });

    it('必須フィールド欠落で InvalidEntityDataError を投げる', () => {
      const item = mapper.toItem(baseEntity);
      delete (item as Record<string, unknown>).Title;
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
