import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryFreshnessCheckRequestRepository } from '../../../src/repositories/in-memory-freshness-check-request.repository.js';

const BASE = 1_700_000_000_000;

describe('InMemoryFreshnessCheckRequestRepository', () => {
  let now: number;
  let repo: InMemoryFreshnessCheckRequestRepository;

  beforeEach(() => {
    now = BASE;
    repo = new InMemoryFreshnessCheckRequestRepository(new InMemorySingleTableStore(), () => now);
  });

  it('put で依頼を記録できる', async () => {
    const saved = await repo.put({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 't1',
      expiresAt: BASE + 1000,
    });

    expect(saved.createdAt).toBe(BASE);
    expect(saved.expiresAt).toBe(BASE + 1000);
    expect(await repo.listByCharacter('u1', 'hiyori')).toHaveLength(1);
  });

  it('同じ Topic への put は上書きで、件数が増えない (冪等)', async () => {
    await repo.put({ userId: 'u1', characterId: 'hiyori', topicId: 't1' });
    now = BASE + 5000;
    await repo.put({ userId: 'u1', characterId: 'hiyori', topicId: 't1' });

    const list = await repo.listByCharacter('u1', 'hiyori');
    expect(list).toHaveLength(1);
    expect(list[0].updatedAt).toBe(BASE + 5000);
  });

  it('listByCharacter は依頼時刻の古い順で、他のキャラ・他の利用者の依頼を含めない', async () => {
    await repo.put({ userId: 'u1', characterId: 'hiyori', topicId: 'b' });
    now = BASE - 1000;
    await repo.put({ userId: 'u1', characterId: 'hiyori', topicId: 'a' });
    await repo.put({ userId: 'u1', characterId: 'ageha', topicId: 'x' });
    await repo.put({ userId: 'u2', characterId: 'hiyori', topicId: 'y' });

    const list = await repo.listByCharacter('u1', 'hiyori');
    expect(list.map((r) => r.topicId)).toEqual(['a', 'b']);
  });

  it('delete で依頼を消せる。存在しなくても成功する', async () => {
    await repo.put({ userId: 'u1', characterId: 'hiyori', topicId: 't1' });

    await repo.delete({ userId: 'u1', characterId: 'hiyori', topicId: 't1' });
    await expect(
      repo.delete({ userId: 'u1', characterId: 'hiyori', topicId: 't1' })
    ).resolves.toBeUndefined();

    expect(await repo.listByCharacter('u1', 'hiyori')).toEqual([]);
  });
});
