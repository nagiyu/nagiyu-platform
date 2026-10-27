import { EntityNotFoundError, InMemorySingleTableStore, OptimisticLockError } from '@nagiyu/aws';
import { InMemoryConsolidationCursorRepository } from '../../../src/repositories/in-memory-consolidation-cursor.repository.js';

describe('InMemoryConsolidationCursorRepository', () => {
  const baseNow = 1_700_000_000_000;
  let now = baseNow;
  let store: InMemorySingleTableStore;
  let repo: InMemoryConsolidationCursorRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    now = baseNow;
    repo = new InMemoryConsolidationCursorRepository(store, () => now);
  });

  describe('get', () => {
    it('存在しない場合 null を返す', async () => {
      expect(await repo.get('u1', 'hiyori')).toBeNull();
    });

    it('保存したカーソルを取得できる', async () => {
      await repo.put({ userId: 'u1', characterId: 'hiyori', msgCursor: 100, webrawCursor: 50 });
      const cursor = await repo.get('u1', 'hiyori');
      expect(cursor?.msgCursor).toBe(100);
      expect(cursor?.webrawCursor).toBe(50);
    });
  });

  describe('put', () => {
    it('新規作成でき、UpdatedAt が nowMs で付与される', async () => {
      const cursor = await repo.put({
        userId: 'u1',
        characterId: 'hiyori',
        msgCursor: 100,
        webrawCursor: 50,
      });
      expect(cursor.updatedAt).toBe(baseNow);
    });

    it('expectedUpdatedAt 未指定での再作成は OptimisticLockError を投げる', async () => {
      await repo.put({ userId: 'u1', characterId: 'hiyori', msgCursor: 100, webrawCursor: 50 });
      await expect(
        repo.put({ userId: 'u1', characterId: 'hiyori', msgCursor: 200, webrawCursor: 60 })
      ).rejects.toBeInstanceOf(OptimisticLockError);
    });

    it('正しい expectedUpdatedAt で前進できる', async () => {
      const created = await repo.put({
        userId: 'u1',
        characterId: 'hiyori',
        msgCursor: 100,
        webrawCursor: 50,
      });
      now += 1000;
      const updated = await repo.put(
        { userId: 'u1', characterId: 'hiyori', msgCursor: 200, webrawCursor: 60 },
        { expectedUpdatedAt: created.updatedAt }
      );
      expect(updated.msgCursor).toBe(200);
      expect(updated.updatedAt).toBe(now);
    });

    it('expectedUpdatedAt を指定してもカーソルが無ければ EntityNotFoundError を投げる', async () => {
      await expect(
        repo.put(
          { userId: 'u1', characterId: 'hiyori', msgCursor: 200, webrawCursor: 60 },
          { expectedUpdatedAt: baseNow }
        )
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('誤った expectedUpdatedAt での更新は OptimisticLockError を投げる（競合検知）', async () => {
      await repo.put({ userId: 'u1', characterId: 'hiyori', msgCursor: 100, webrawCursor: 50 });
      await expect(
        repo.put(
          { userId: 'u1', characterId: 'hiyori', msgCursor: 200, webrawCursor: 60 },
          { expectedUpdatedAt: 999 }
        )
      ).rejects.toMatchObject({ name: 'OptimisticLockError' });
    });
  });
});
