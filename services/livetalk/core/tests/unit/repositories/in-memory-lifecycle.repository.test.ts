import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryLifecycleRepository } from '../../../src/repositories/in-memory-lifecycle.repository.js';

describe('InMemoryLifecycleRepository', () => {
  let store: InMemorySingleTableStore;
  let repo: InMemoryLifecycleRepository;
  const baseNow = 1_700_000_000_000;
  let now = baseNow;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    now = baseNow;
    repo = new InMemoryLifecycleRepository(store, () => now);
  });

  it('nowMs を省略した場合は Date.now が使われる', async () => {
    const localStore = new InMemorySingleTableStore();
    const localRepo = new InMemoryLifecycleRepository(localStore);
    const before = Date.now();
    const result = await localRepo.upsert({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Bedtime: '01:30',
      WakeUpTime: '09:30',
    });
    expect(result.CreatedAt).toBeGreaterThanOrEqual(before);
  });

  it('get は存在しない場合に null を返す', async () => {
    const result = await repo.get({ userId: 'u1', characterId: 'hiyori' });
    expect(result).toBeNull();
  });

  it('upsert して get できる', async () => {
    await repo.upsert({ UserID: 'u1', CharacterID: 'hiyori', Bedtime: '01:30', WakeUpTime: '09:30' });
    const result = await repo.get({ userId: 'u1', characterId: 'hiyori' });
    expect(result).not.toBeNull();
    expect(result?.Bedtime).toBe('01:30');
    expect(result?.WakeUpTime).toBe('09:30');
    expect(result?.CreatedAt).toBe(baseNow);
    expect(result?.UpdatedAt).toBe(baseNow);
  });

  it('再 upsert は CreatedAt を保持しつつ設定値を更新する', async () => {
    await repo.upsert({ UserID: 'u1', CharacterID: 'hiyori', Bedtime: '01:30', WakeUpTime: '09:30' });

    now += 5000;
    await repo.upsert(
      { UserID: 'u1', CharacterID: 'hiyori', Bedtime: '02:00', WakeUpTime: '10:00' },
      { Bedtime: '02:00', WakeUpTime: '10:00' }
    );

    const result = await repo.get({ userId: 'u1', characterId: 'hiyori' });
    expect(result?.Bedtime).toBe('02:00');
    expect(result?.WakeUpTime).toBe('10:00');
    expect(result?.CreatedAt).toBe(baseNow);
    expect(result?.UpdatedAt).toBe(baseNow + 5000);
  });

  it('updates で部分更新できる', async () => {
    await repo.upsert({ UserID: 'u1', CharacterID: 'hiyori', Bedtime: '01:30', WakeUpTime: '09:30' });
    now += 1000;
    await repo.upsert(
      { UserID: 'u1', CharacterID: 'hiyori', Bedtime: '01:30', WakeUpTime: '09:30' },
      { Bedtime: '02:00' }
    );

    const result = await repo.get({ userId: 'u1', characterId: 'hiyori' });
    expect(result?.Bedtime).toBe('02:00');
    expect(result?.WakeUpTime).toBe('09:30');
  });

  it('異なるユーザーのデータは独立している', async () => {
    await repo.upsert({ UserID: 'u1', CharacterID: 'hiyori', Bedtime: '01:30', WakeUpTime: '09:30' });
    await repo.upsert({ UserID: 'u2', CharacterID: 'hiyori', Bedtime: '00:00', WakeUpTime: '08:00' });

    const r1 = await repo.get({ userId: 'u1', characterId: 'hiyori' });
    const r2 = await repo.get({ userId: 'u2', characterId: 'hiyori' });
    expect(r1?.Bedtime).toBe('01:30');
    expect(r2?.Bedtime).toBe('00:00');
  });
});
