import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryMemorySummaryRepository } from '../../../src/repositories/in-memory-memory-summary.repository.js';
import type { CreateMemorySummaryInput } from '../../../src/entities/memory-summary.entity.js';

const baseInput: CreateMemorySummaryInput = {
  UserID: 'u1',
  CharacterID: 'hiyori',
  SummaryText: 'コーヒーが好きな人',
  LastCompressedAt: 1_750_000_000_000,
};

describe('InMemoryMemorySummaryRepository', () => {
  const makeRepo = (nowMs = () => 1_750_000_000_000) =>
    new InMemoryMemorySummaryRepository(new InMemorySingleTableStore(), nowMs);

  describe('get', () => {
    it('存在しない場合は null を返す', async () => {
      const repo = makeRepo();
      expect(await repo.get('u1', 'hiyori')).toBeNull();
    });

    it('put 後に get するとエンティティが返る', async () => {
      const repo = makeRepo();
      await repo.put(baseInput);
      const entity = await repo.get('u1', 'hiyori');
      expect(entity).not.toBeNull();
      expect(entity?.SummaryText).toBe('コーヒーが好きな人');
    });
  });

  describe('put', () => {
    it('エンティティを保存して返す', async () => {
      const repo = makeRepo();
      const entity = await repo.put(baseInput);
      expect(entity.UserID).toBe('u1');
      expect(entity.CharacterID).toBe('hiyori');
      expect(entity.SummaryText).toBe('コーヒーが好きな人');
      expect(entity.CreatedAt).toBe(1_750_000_000_000);
      expect(entity.UpdatedAt).toBe(1_750_000_000_000);
    });

    it('2 回 put したとき CreatedAt が初回の値を維持する', async () => {
      let tick = 1_000;
      const repo = new InMemoryMemorySummaryRepository(
        new InMemorySingleTableStore(),
        () => tick
      );
      const first = await repo.put(baseInput);
      tick = 2_000;
      const second = await repo.put({ ...baseInput, SummaryText: '更新済み要約' });

      expect(first.CreatedAt).toBe(1_000);
      expect(second.CreatedAt).toBe(1_000); // 初回の CreatedAt が保持される
      expect(second.UpdatedAt).toBe(2_000);
      expect(second.SummaryText).toBe('更新済み要約');
    });

    it('異なるユーザーは独立して保存される', async () => {
      const repo = makeRepo();
      await repo.put({ ...baseInput, UserID: 'u1' });
      await repo.put({ ...baseInput, UserID: 'u2', SummaryText: '別ユーザーの要約' });

      const e1 = await repo.get('u1', 'hiyori');
      const e2 = await repo.get('u2', 'hiyori');
      expect(e1?.SummaryText).toBe('コーヒーが好きな人');
      expect(e2?.SummaryText).toBe('別ユーザーの要約');
    });
  });
});
