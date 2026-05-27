import { InvalidEntityDataError } from '@nagiyu/aws';
import { MemoryMapper } from '../../../src/mappers/memory.mapper.js';
import type { MemoryEntity } from '../../../src/entities/memory.entity.js';

const baseEntity: MemoryEntity = {
  UserID: 'user1',
  CharacterID: 'hiyori',
  MemoryID: 'MEM-001',
  Tier: 'B',
  Category: 'food',
  Content: 'コーヒーが好き',
  Confidence: 0.8,
  ReferencedCount: 3,
  CreatedAt: '2026-01-01T00:00:00.000Z',
  UpdatedAt: '2026-01-02T00:00:00.000Z',
};

describe('MemoryMapper', () => {
  let mapper: MemoryMapper;

  beforeEach(() => {
    mapper = new MemoryMapper();
  });

  describe('toItem', () => {
    it('エンティティを DynamoDB Item に変換する', () => {
      const item = mapper.toItem(baseEntity);
      expect(item.PK).toBe('USER#user1');
      expect(item.SK).toBe('CHAR#hiyori#MEM#B#food#MEM-001');
      expect(item.Type).toBe('Memory');
      expect(item.UserID).toBe('user1');
      expect(item.CharacterID).toBe('hiyori');
      expect(item.MemoryID).toBe('MEM-001');
      expect(item.Tier).toBe('B');
      expect(item.Category).toBe('food');
      expect(item.Content).toBe('コーヒーが好き');
      expect(item.Confidence).toBe(0.8);
      expect(item.ReferencedCount).toBe(3);
      expect(item.CreatedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(item.UpdatedAt).toBe('2026-01-02T00:00:00.000Z');
    });

    it('LastReferencedAt / Embedding が undefined の場合は Item に含めない', () => {
      const item = mapper.toItem(baseEntity);
      expect(item.LastReferencedAt).toBeUndefined();
      expect(item.Embedding).toBeUndefined();
    });

    it('LastReferencedAt / Embedding が設定されている場合は Item に含める', () => {
      const entity: MemoryEntity = {
        ...baseEntity,
        LastReferencedAt: '2026-01-03T00:00:00.000Z',
        Embedding: [0.1, 0.2, 0.3],
      };
      const item = mapper.toItem(entity);
      expect(item.LastReferencedAt).toBe('2026-01-03T00:00:00.000Z');
      expect(item.Embedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('全 Tier の SK を正しく組み立てる', () => {
      const tiers = ['A', 'B', 'C', 'D'] as const;
      for (const tier of tiers) {
        const entity: MemoryEntity = { ...baseEntity, Tier: tier };
        const item = mapper.toItem(entity);
        expect(item.SK).toBe(`CHAR#hiyori#MEM#${tier}#food#MEM-001`);
      }
    });
  });

  describe('toEntity', () => {
    it('DynamoDB Item をエンティティに変換する', () => {
      const item = {
        PK: 'USER#user1',
        SK: 'CHAR#hiyori#MEM#B#food#MEM-001',
        Type: 'Memory',
        UserID: 'user1',
        CharacterID: 'hiyori',
        MemoryID: 'MEM-001',
        Tier: 'B',
        Category: 'food',
        Content: 'コーヒーが好き',
        Confidence: 0.8,
        ReferencedCount: 3,
        CreatedAt: '2026-01-01T00:00:00.000Z',
        UpdatedAt: '2026-01-02T00:00:00.000Z',
      };
      const entity = mapper.toEntity(item);
      expect(entity.UserID).toBe('user1');
      expect(entity.Tier).toBe('B');
      expect(entity.Confidence).toBe(0.8);
      expect(entity.LastReferencedAt).toBeUndefined();
      expect(entity.Embedding).toBeUndefined();
    });

    it('不正な Tier は InvalidEntityDataError を投げる', () => {
      const item = { ...mapper.toItem(baseEntity), Tier: 'Z' };
      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });

    it('Confidence が 0 未満は InvalidEntityDataError を投げる', () => {
      const item = { ...mapper.toItem(baseEntity), Confidence: -0.1 };
      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });

    it('Confidence が 1 超は InvalidEntityDataError を投げる', () => {
      const item = { ...mapper.toItem(baseEntity), Confidence: 1.1 };
      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });

    it('LastReferencedAt が存在する場合はエンティティに含める', () => {
      const item = {
        ...mapper.toItem(baseEntity),
        LastReferencedAt: '2026-01-03T00:00:00.000Z',
      };
      const entity = mapper.toEntity(item);
      expect(entity.LastReferencedAt).toBe('2026-01-03T00:00:00.000Z');
    });

    it('Embedding が存在する場合はエンティティに含める', () => {
      const item = { ...mapper.toItem(baseEntity), Embedding: [0.1, 0.2] };
      const entity = mapper.toEntity(item);
      expect(entity.Embedding).toEqual([0.1, 0.2]);
    });
  });

  describe('buildKeys', () => {
    it('PK / SK を正しく組み立てる', () => {
      const { pk, sk } = mapper.buildKeys({
        userId: 'user1',
        characterId: 'hiyori',
        tier: 'A',
        category: 'name',
        memoryId: 'MEM-001',
      });
      expect(pk).toBe('USER#user1');
      expect(sk).toBe('CHAR#hiyori#MEM#A#name#MEM-001');
    });
  });

  describe('toItem → toEntity ラウンドトリップ', () => {
    it('Embedding 付きエンティティも往復変換できる', () => {
      const entity: MemoryEntity = {
        ...baseEntity,
        LastReferencedAt: '2026-01-03T00:00:00.000Z',
        Embedding: [0.5, 0.6],
      };
      const roundTripped = mapper.toEntity(mapper.toItem(entity));
      expect(roundTripped).toEqual(entity);
    });
  });
});
