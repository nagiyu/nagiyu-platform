import { MemorySummaryMapper } from '../../../src/mappers/memory-summary.mapper.js';

const mapper = new MemorySummaryMapper();

const entity = {
  UserID: 'u1',
  CharacterID: 'hiyori',
  SummaryText: 'コーヒーが好きな人',
  LastCompressedAt: 1_750_000_000_000,
  CreatedAt: 1_749_000_000_000,
  UpdatedAt: 1_750_000_000_000,
};

const item = {
  PK: 'USER#u1',
  SK: 'CHAR#hiyori#MEMORY#SUMMARY',
  Type: 'MemorySummary',
  UserID: 'u1',
  CharacterID: 'hiyori',
  SummaryText: 'コーヒーが好きな人',
  LastCompressedAt: 1_750_000_000_000,
  CreatedAt: 1_749_000_000_000,
  UpdatedAt: 1_750_000_000_000,
};

describe('MemorySummaryMapper', () => {
  describe('buildKeys', () => {
    it('正しい PK / SK を生成する', () => {
      const { pk, sk } = mapper.buildKeys({ userId: 'u1', characterId: 'hiyori' });
      expect(pk).toBe('USER#u1');
      expect(sk).toBe('CHAR#hiyori#MEMORY#SUMMARY');
    });
  });

  describe('toItem', () => {
    it('エンティティを DynamoDB アイテムに変換する', () => {
      expect(mapper.toItem(entity)).toEqual(item);
    });
  });

  describe('toEntity', () => {
    it('DynamoDB アイテムをエンティティに変換する', () => {
      expect(mapper.toEntity(item)).toEqual(entity);
    });

    it('SummaryText が空文字でも変換できる', () => {
      const emptyItem = { ...item, SummaryText: '' };
      const result = mapper.toEntity(emptyItem);
      expect(result.SummaryText).toBe('');
    });

    it('必須フィールドが欠損していると例外を投げる', () => {
      const badItem = { ...item, UserID: undefined };
      expect(() => mapper.toEntity(badItem)).toThrow();
    });
  });
});
