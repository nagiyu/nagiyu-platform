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

  it('nowMs を省略した場合は Date.now が使われる', async () => {
    const localStore = new InMemorySingleTableStore();
    const repo = new InMemoryProfileRepository(localStore);
    const before = Date.now();
    const result = await repo.upsert({ UserID: 'u1' });
    expect(result.CreatedAt).toBeGreaterThanOrEqual(before);
  });

  it('初回 upsert で新規作成され、LastActiveAt 未指定なら現在時刻が入る', async () => {
    const first = await repo.upsert({ UserID: 'u1' });
    expect(first.UserID).toBe('u1');
    expect(first.CreatedAt).toBe(baseNow);
    expect(first.UpdatedAt).toBe(baseNow);
    expect(first.LastActiveAt).toBe(baseNow);
  });

  it('再 upsert は CreatedAt を保持し UpdatedAt / LastActiveAt のみ更新する', async () => {
    await repo.upsert({ UserID: 'u1', LastActiveAt: baseNow });

    now += 1000;
    const updated = await repo.upsert({ UserID: 'u1' }, { LastActiveAt: now });

    expect(updated.CreatedAt).toBe(baseNow);
    expect(updated.UpdatedAt).toBe(baseNow + 1000);
    expect(updated.LastActiveAt).toBe(baseNow + 1000);
  });

  it('getById は未登録なら null を返す', async () => {
    expect(await repo.getById({ userId: 'unknown' })).toBeNull();
  });

  it('getById は登録済みデータを返す', async () => {
    await repo.upsert({ UserID: 'u1' });
    const got = await repo.getById({ userId: 'u1' });
    expect(got?.UserID).toBe('u1');
    expect(got?.LastActiveAt).toBe(baseNow);
  });

  it('Auth 側情報を渡さなくても upsert が成立する（PII は LiveTalk に持ち込まない）', async () => {
    const result = await repo.upsert({ UserID: 'u1' });
    // 余計な属性がリポジトリ側で勝手に生成されていないこと
    expect(Object.keys(result).sort()).toEqual(
      ['CreatedAt', 'LastActiveAt', 'UpdatedAt', 'UserID'].sort()
    );
  });
});
