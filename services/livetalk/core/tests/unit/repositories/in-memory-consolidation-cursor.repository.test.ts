import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryConsolidationCursorRepository } from '../../../src/repositories/in-memory-consolidation-cursor.repository.js';
import { OptimisticLockError } from '../../../src/repositories/optimistic-lock.error.js';

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
      await repo.put({ UserID: 'u1', CharacterID: 'hiyori', MsgCursor: 100, WebrawCursor: 50 });
      const cursor = await repo.get('u1', 'hiyori');
      expect(cursor?.MsgCursor).toBe(100);
      expect(cursor?.WebrawCursor).toBe(50);
    });
  });

  describe('put', () => {
    it('新規作成でき、UpdatedAt が nowMs で付与される', async () => {
      const cursor = await repo.put({
        UserID: 'u1',
        CharacterID: 'hiyori',
        MsgCursor: 100,
        WebrawCursor: 50,
      });
      expect(cursor.UpdatedAt).toBe(baseNow);
    });

    it('expectedUpdatedAt 未指定での再作成は OptimisticLockError を投げる', async () => {
      await repo.put({ UserID: 'u1', CharacterID: 'hiyori', MsgCursor: 100, WebrawCursor: 50 });
      await expect(
        repo.put({ UserID: 'u1', CharacterID: 'hiyori', MsgCursor: 200, WebrawCursor: 60 })
      ).rejects.toBeInstanceOf(OptimisticLockError);
    });

    it('正しい expectedUpdatedAt で前進できる', async () => {
      const created = await repo.put({
        UserID: 'u1',
        CharacterID: 'hiyori',
        MsgCursor: 100,
        WebrawCursor: 50,
      });
      now += 1000;
      const updated = await repo.put(
        { UserID: 'u1', CharacterID: 'hiyori', MsgCursor: 200, WebrawCursor: 60 },
        { expectedUpdatedAt: created.UpdatedAt }
      );
      expect(updated.MsgCursor).toBe(200);
      expect(updated.UpdatedAt).toBe(now);
    });

    it('誤った expectedUpdatedAt での更新は OptimisticLockError を投げる（競合検知）', async () => {
      await repo.put({ UserID: 'u1', CharacterID: 'hiyori', MsgCursor: 100, WebrawCursor: 50 });
      await expect(
        repo.put(
          { UserID: 'u1', CharacterID: 'hiyori', MsgCursor: 200, WebrawCursor: 60 },
          { expectedUpdatedAt: 999 }
        )
      ).rejects.toMatchObject({ name: 'OptimisticLockError' });
    });
  });
});
