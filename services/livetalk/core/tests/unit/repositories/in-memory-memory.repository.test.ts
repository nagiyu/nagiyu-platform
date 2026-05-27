import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryMemoryRepository } from '../../../src/repositories/in-memory-memory.repository.js';
import { MEMORY_TIER_C_TTL_SECONDS, MEMORY_TIER_D_TTL_SECONDS } from '../../../src/constants.js';
import type { CreateMemoryInput } from '../../../src/entities/memory.entity.js';

const baseInput: CreateMemoryInput = {
  UserID: 'u1',
  CharacterID: 'hiyori',
  Tier: 'B',
  Category: 'food',
  Content: 'コーヒーが好き',
  Confidence: 0.8,
  ReferencedCount: 0,
};

describe('InMemoryMemoryRepository', () => {
  let store: InMemorySingleTableStore;
  let repo: InMemoryMemoryRepository;
  const fixedNow = '2026-01-01T00:00:00.000Z';
  let callCount = 0;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    callCount = 0;
    const ulidFactory = () => `MEM-${String(++callCount).padStart(3, '0')}`;
    repo = new InMemoryMemoryRepository(store, ulidFactory, () => fixedNow);
  });

  describe('put', () => {
    it('メモリを保存し MemoryID / CreatedAt / UpdatedAt を付与する', async () => {
      const entity = await repo.put(baseInput);
      expect(entity.MemoryID).toBe('MEM-001');
      expect(entity.CreatedAt).toBe(fixedNow);
      expect(entity.UpdatedAt).toBe(fixedNow);
      expect(entity.Tier).toBe('B');
    });

    it('明示的な MemoryID を尊重する', async () => {
      const entity = await repo.put({ ...baseInput, MemoryID: 'explicit-id' });
      expect(entity.MemoryID).toBe('explicit-id');
    });

    it('Tier A/B には TTL を付与しない', async () => {
      await repo.put({ ...baseInput, Tier: 'A' });
      await repo.put({ ...baseInput, Tier: 'B' });
      const items = Array.from(
        (store as unknown as { store: Map<string, Record<string, unknown>> }).store.values()
      );
      for (const item of items) {
        expect(item.TTL).toBeUndefined();
      }
    });

    it('Tier C には 30 日後の TTL を Unix 秒で付与する', async () => {
      const before = Math.floor(Date.now() / 1000);
      await repo.put({ ...baseInput, Tier: 'C' });
      const items = Array.from(
        (store as unknown as { store: Map<string, Record<string, unknown>> }).store.values()
      );
      const ttl = items[0].TTL as number;
      expect(ttl).toBeGreaterThanOrEqual(before + MEMORY_TIER_C_TTL_SECONDS);
      expect(ttl).toBeLessThanOrEqual(
        Math.floor(Date.now() / 1000) + MEMORY_TIER_C_TTL_SECONDS + 5
      );
    });

    it('Tier D には 1 日後の TTL を Unix 秒で付与する', async () => {
      const before = Math.floor(Date.now() / 1000);
      await repo.put({ ...baseInput, Tier: 'D' });
      const items = Array.from(
        (store as unknown as { store: Map<string, Record<string, unknown>> }).store.values()
      );
      const ttl = items[0].TTL as number;
      expect(ttl).toBeGreaterThanOrEqual(before + MEMORY_TIER_D_TTL_SECONDS);
    });
  });

  describe('get', () => {
    it('保存したメモリを取得できる', async () => {
      const saved = await repo.put(baseInput);
      const found = await repo.get({
        userId: 'u1',
        characterId: 'hiyori',
        tier: 'B',
        category: 'food',
        memoryId: saved.MemoryID,
      });
      expect(found).not.toBeNull();
      expect(found?.Content).toBe('コーヒーが好き');
    });

    it('存在しないキーは null を返す', async () => {
      const found = await repo.get({
        userId: 'u1',
        characterId: 'hiyori',
        tier: 'A',
        category: 'name',
        memoryId: 'missing',
      });
      expect(found).toBeNull();
    });
  });

  describe('listByTier', () => {
    it('指定 Tier のメモリのみを返す', async () => {
      await repo.put({ ...baseInput, Tier: 'A', Category: 'name', Content: '名前' });
      await repo.put({ ...baseInput, Tier: 'B', Category: 'food', Content: 'コーヒー' });
      await repo.put({ ...baseInput, Tier: 'B', Category: 'hobby', Content: '読書' });

      const result = await repo.listByTier('u1', 'hiyori', 'B');
      expect(result).toHaveLength(2);
      expect(result.every((m) => m.Tier === 'B')).toBe(true);
    });

    it('別ユーザー / 別キャラのメモリは混入しない', async () => {
      await repo.put({ ...baseInput, Tier: 'A' });
      await repo.put({ ...baseInput, UserID: 'u2', Tier: 'A' });
      await repo.put({ ...baseInput, CharacterID: 'other', Tier: 'A' });

      const result = await repo.listByTier('u1', 'hiyori', 'A');
      expect(result).toHaveLength(1);
    });
  });

  describe('listByCategory', () => {
    it('指定カテゴリのメモリを Tier 横断で返す', async () => {
      await repo.put({ ...baseInput, Tier: 'A', Category: 'food', Content: 'お米' });
      await repo.put({ ...baseInput, Tier: 'B', Category: 'food', Content: 'コーヒー' });
      await repo.put({ ...baseInput, Tier: 'C', Category: 'hobby', Content: '読書' });

      const result = await repo.listByCategory('u1', 'hiyori', 'food');
      expect(result).toHaveLength(2);
      expect(result.every((m) => m.Category === 'food')).toBe(true);
    });

    it('存在しないカテゴリは空配列', async () => {
      await repo.put(baseInput);
      const result = await repo.listByCategory('u1', 'hiyori', 'nonexistent');
      expect(result).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('Content / Confidence / ReferencedCount / UpdatedAt を更新できる', async () => {
      const saved = await repo.put(baseInput);
      const updated = await repo.update({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Tier: 'B',
        Category: 'food',
        MemoryID: saved.MemoryID,
        Content: '緑茶も好き',
        Confidence: 0.9,
        ReferencedCount: 1,
      });
      expect(updated.Content).toBe('緑茶も好き');
      expect(updated.Confidence).toBe(0.9);
      expect(updated.ReferencedCount).toBe(1);
      expect(updated.UpdatedAt).toBe(fixedNow);
    });

    it('存在しないメモリの更新はエラーを投げる', async () => {
      await expect(
        repo.update({
          UserID: 'u1',
          CharacterID: 'hiyori',
          Tier: 'B',
          Category: 'food',
          MemoryID: 'missing',
        })
      ).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('メモリを削除できる', async () => {
      const saved = await repo.put(baseInput);
      await repo.delete({
        userId: 'u1',
        characterId: 'hiyori',
        tier: 'B',
        category: 'food',
        memoryId: saved.MemoryID,
      });
      const found = await repo.get({
        userId: 'u1',
        characterId: 'hiyori',
        tier: 'B',
        category: 'food',
        memoryId: saved.MemoryID,
      });
      expect(found).toBeNull();
    });
  });

  describe('promote / demote', () => {
    it('promote は新 Tier で取得でき、旧 Tier では取得できなくなる', async () => {
      const saved = await repo.put({ ...baseInput, Tier: 'C' });
      const promoted = await repo.promote(saved, 'B');

      expect(promoted.Tier).toBe('B');

      const newFound = await repo.get({
        userId: 'u1',
        characterId: 'hiyori',
        tier: 'B',
        category: 'food',
        memoryId: saved.MemoryID,
      });
      expect(newFound).not.toBeNull();

      const oldFound = await repo.get({
        userId: 'u1',
        characterId: 'hiyori',
        tier: 'C',
        category: 'food',
        memoryId: saved.MemoryID,
      });
      expect(oldFound).toBeNull();
    });

    it('demote は新 Tier で取得でき、旧 Tier では取得できなくなる', async () => {
      const saved = await repo.put({ ...baseInput, Tier: 'A' });
      const demoted = await repo.demote(saved, 'C');

      expect(demoted.Tier).toBe('C');

      const newFound = await repo.get({
        userId: 'u1',
        characterId: 'hiyori',
        tier: 'C',
        category: 'food',
        memoryId: saved.MemoryID,
      });
      expect(newFound).not.toBeNull();

      const oldFound = await repo.get({
        userId: 'u1',
        characterId: 'hiyori',
        tier: 'A',
        category: 'food',
        memoryId: saved.MemoryID,
      });
      expect(oldFound).toBeNull();
    });

    it('D へ demote すると TTL が付与される', async () => {
      const saved = await repo.put({ ...baseInput, Tier: 'B' });
      await repo.demote(saved, 'D');

      const item = store.get(`USER#u1`, `CHAR#hiyori#MEM#D#food#${saved.MemoryID}`);
      expect(item?.TTL).toBeDefined();
    });

    it('A へ promote すると TTL がない', async () => {
      const saved = await repo.put({ ...baseInput, Tier: 'C' });
      const promoted = await repo.promote(saved, 'A');

      const item = store.get(`USER#u1`, `CHAR#hiyori#MEM#A#food#${promoted.MemoryID}`);
      expect(item?.TTL).toBeUndefined();
    });
  });
});
