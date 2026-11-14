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

  it('同じ Topic への put は最初の依頼を残し、依頼時刻を新しくしない (冪等)', async () => {
    await repo.put({ userId: 'u1', characterId: 'hiyori', topicId: 't1' });
    now = BASE + 5000;
    const second = await repo.put({ userId: 'u1', characterId: 'hiyori', topicId: 't1' });

    expect(second.createdAt).toBe(BASE);
    const list = await repo.listByCharacter('u1', 'hiyori');
    expect(list).toHaveLength(1);
    expect(list[0].createdAt).toBe(BASE);
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
