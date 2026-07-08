import { InvalidEntityDataError } from '@nagiyu/aws';
import { ConsolidationCursorMapper } from '../../../src/mappers/consolidation-cursor.mapper.js';
import type { ConsolidationCursorEntity } from '../../../src/entities/consolidation-cursor.entity.js';

const baseEntity: ConsolidationCursorEntity = {
  UserID: 'user1',
  CharacterID: 'hiyori',
  MsgCursor: 1_750_000_000_000,
  WebrawCursor: 1_749_999_000_000,
  UpdatedAt: 1_750_000_100_000,
};

describe('ConsolidationCursorMapper', () => {
  let mapper: ConsolidationCursorMapper;

  beforeEach(() => {
    mapper = new ConsolidationCursorMapper();
  });

  describe('toItem', () => {
    it('エンティティを DynamoDB Item に変換する', () => {
      const item = mapper.toItem(baseEntity);
      expect(item.PK).toBe('USER#user1');
      expect(item.SK).toBe('CHAR#hiyori#CURSOR');
      expect(item.Type).toBe('ConsolidationCursor');
      expect(item.MsgCursor).toBe(1_750_000_000_000);
      expect(item.WebrawCursor).toBe(1_749_999_000_000);
    });
  });

  describe('toEntity', () => {
    it('DynamoDB Item をエンティティに復元する', () => {
      const item = mapper.toItem(baseEntity);
      const entity = mapper.toEntity(item);
      expect(entity).toEqual(baseEntity);
    });

    it('必須フィールド欠落で InvalidEntityDataError を投げる', () => {
      const item = mapper.toItem(baseEntity);
      delete (item as Record<string, unknown>).MsgCursor;
      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });
  });

  describe('buildKeys', () => {
    it('PK / SK を組み立てる（固定・1 item）', () => {
      const { pk, sk } = mapper.buildKeys({ userId: 'user1', characterId: 'hiyori' });
      expect(pk).toBe('USER#user1');
      expect(sk).toBe('CHAR#hiyori#CURSOR');
    });
  });
});
