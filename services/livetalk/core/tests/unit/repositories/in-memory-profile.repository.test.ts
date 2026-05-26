import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryProfileRepository } from '../../../src/repositories/in-memory-profile.repository.js';

describe('InMemoryProfileRepository', () => {
  let store: InMemorySingleTableStore;
  let repo: InMemoryProfileRepository;
  const baseNow = 1_700_000_000_000;
  let now = baseNow;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    now = baseNow;
    repo = new InMemoryProfileRepository(store, () => now);
  });

  it('初回 upsert で新規作成、再 upsert で UpdatedAt のみ更新 (CreatedAt 保持)', async () => {
    const first = await repo.upsert({
      UserID: 'u1',
      GoogleID: 'g1',
      DisplayName: 'Taro',
      Email: 't@example.com',
      LastActiveAt: now,
    });
    expect(first.CreatedAt).toBe(baseNow);
    expect(first.UpdatedAt).toBe(baseNow);

    now += 1000;
    const updated = await repo.upsert(
      {
        UserID: 'u1',
        GoogleID: 'g1',
        DisplayName: 'Taro',
        Email: 't@example.com',
        LastActiveAt: now,
      },
      { DisplayName: 'New Name', LastActiveAt: now }
    );

    expect(updated.CreatedAt).toBe(baseNow);
    expect(updated.UpdatedAt).toBe(baseNow + 1000);
    expect(updated.DisplayName).toBe('New Name');
    expect(updated.LastActiveAt).toBe(baseNow + 1000);
  });

  it('getById は未登録なら null を返す', async () => {
    expect(await repo.getById({ userId: 'unknown' })).toBeNull();
  });

  it('getById は登録済みデータを返す', async () => {
    await repo.upsert({
      UserID: 'u1',
      GoogleID: 'g1',
      DisplayName: 'Taro',
      Email: 't@example.com',
      LastActiveAt: now,
    });
    const got = await repo.getById({ userId: 'u1' });
    expect(got?.UserID).toBe('u1');
    expect(got?.Email).toBe('t@example.com');
  });
});
