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
      userId: 'u1',
      characterId: 'hiyori',
      bedtime: '01:30',
      wakeUpTime: '09:30',
    });
    expect(result.createdAt).toBeGreaterThanOrEqual(before);
  });

  it('get は存在しない場合に null を返す', async () => {
    const result = await repo.get({ userId: 'u1', characterId: 'hiyori' });
    expect(result).toBeNull();
  });

  it('upsert して get できる', async () => {
    await repo.upsert({
      userId: 'u1',
      characterId: 'hiyori',
      bedtime: '01:30',
      wakeUpTime: '09:30',
    });
    const result = await repo.get({ userId: 'u1', characterId: 'hiyori' });
    expect(result).not.toBeNull();
    expect(result?.bedtime).toBe('01:30');
    expect(result?.wakeUpTime).toBe('09:30');
    expect(result?.createdAt).toBe(baseNow);
    expect(result?.updatedAt).toBe(baseNow);
  });

  it('再 upsert は CreatedAt を保持しつつ設定値を更新する', async () => {
    await repo.upsert({
      userId: 'u1',
      characterId: 'hiyori',
      bedtime: '01:30',
      wakeUpTime: '09:30',
    });

    now += 5000;
    await repo.upsert(
      { userId: 'u1', characterId: 'hiyori', bedtime: '02:00', wakeUpTime: '10:00' },
      { bedtime: '02:00', wakeUpTime: '10:00' }
    );

    const result = await repo.get({ userId: 'u1', characterId: 'hiyori' });
    expect(result?.bedtime).toBe('02:00');
    expect(result?.wakeUpTime).toBe('10:00');
    expect(result?.createdAt).toBe(baseNow);
    expect(result?.updatedAt).toBe(baseNow + 5000);
  });

  it('updates で部分更新できる', async () => {
    await repo.upsert({
      userId: 'u1',
      characterId: 'hiyori',
      bedtime: '01:30',
      wakeUpTime: '09:30',
    });
    now += 1000;
    await repo.upsert(
      { userId: 'u1', characterId: 'hiyori', bedtime: '01:30', wakeUpTime: '09:30' },
      { bedtime: '02:00' }
    );

    const result = await repo.get({ userId: 'u1', characterId: 'hiyori' });
    expect(result?.bedtime).toBe('02:00');
    expect(result?.wakeUpTime).toBe('09:30');
  });

  it('異なるユーザーのデータは独立している', async () => {
    await repo.upsert({
      userId: 'u1',
      characterId: 'hiyori',
      bedtime: '01:30',
      wakeUpTime: '09:30',
    });
    await repo.upsert({
      userId: 'u2',
      characterId: 'hiyori',
      bedtime: '00:00',
      wakeUpTime: '08:00',
    });

    const r1 = await repo.get({ userId: 'u1', characterId: 'hiyori' });
    const r2 = await repo.get({ userId: 'u2', characterId: 'hiyori' });
    expect(r1?.bedtime).toBe('01:30');
    expect(r2?.bedtime).toBe('00:00');
  });

  describe('updateUserActivityProfile', () => {
    const profile = {
      morningPeak: '08:00',
      eveningPeak: '21:00',
      sampleSize: 10,
      lastLearnedAt: '2026-06-01T00:00:00.000Z',
    };

    it('既存なしの場合はデフォルト Bedtime/WakeUpTime で新規作成する', async () => {
      const result = await repo.updateUserActivityProfile(
        { userId: 'u1', characterId: 'hiyori' },
        profile
      );
      expect(result.userActivityProfile).toEqual(profile);
      expect(result.bedtime).toBeDefined();
      expect(result.wakeUpTime).toBeDefined();

      const fetched = await repo.get({ userId: 'u1', characterId: 'hiyori' });
      expect(fetched?.userActivityProfile).toEqual(profile);
    });

    it('既存ありの場合は Bedtime/WakeUpTime を保持する', async () => {
      await repo.upsert({
        userId: 'u1',
        characterId: 'hiyori',
        bedtime: '02:00',
        wakeUpTime: '10:00',
      });

      now += 1000;
      const result = await repo.updateUserActivityProfile(
        { userId: 'u1', characterId: 'hiyori' },
        profile
      );
      expect(result.bedtime).toBe('02:00');
      expect(result.wakeUpTime).toBe('10:00');
      expect(result.userActivityProfile).toEqual(profile);
    });

    it('二度呼ぶと最新プロファイルで上書きされる', async () => {
      await repo.updateUserActivityProfile({ userId: 'u1', characterId: 'hiyori' }, profile);
      const profile2 = { ...profile, sampleSize: 99, morningPeak: '07:00' };
      now += 1000;
      await repo.updateUserActivityProfile({ userId: 'u1', characterId: 'hiyori' }, profile2);

      const fetched = await repo.get({ userId: 'u1', characterId: 'hiyori' });
      expect(fetched?.userActivityProfile?.sampleSize).toBe(99);
      expect(fetched?.userActivityProfile?.morningPeak).toBe('07:00');
    });

    it('upsert で UserActivityProfile が保持される', async () => {
      await repo.updateUserActivityProfile({ userId: 'u1', characterId: 'hiyori' }, profile);
      now += 1000;
      await repo.upsert(
        { userId: 'u1', characterId: 'hiyori', bedtime: '02:00', wakeUpTime: '10:00' },
        { bedtime: '02:00' }
      );

      const fetched = await repo.get({ userId: 'u1', characterId: 'hiyori' });
      expect(fetched?.userActivityProfile).toEqual(profile);
    });
  });

  describe('updateSchedule', () => {
    it('Bedtime と WakeUpTime を更新する', async () => {
      await repo.upsert({
        userId: 'u1',
        characterId: 'hiyori',
        bedtime: '01:30',
        wakeUpTime: '09:30',
      });
      now += 1000;
      const result = await repo.updateSchedule(
        { userId: 'u1', characterId: 'hiyori' },
        { bedtime: '23:48', wakeUpTime: '08:54' }
      );

      expect(result.bedtime).toBe('23:48');
      expect(result.wakeUpTime).toBe('08:54');

      const fetched = await repo.get({ userId: 'u1', characterId: 'hiyori' });
      expect(fetched?.bedtime).toBe('23:48');
      expect(fetched?.wakeUpTime).toBe('08:54');
    });

    it('UserActivityProfile を保持する', async () => {
      const profile = {
        morningPeak: '09:00',
        eveningPeak: '22:00',
        sampleSize: 5,
        lastLearnedAt: '2026-06-01T00:00:00.000Z',
      };
      await repo.updateUserActivityProfile({ userId: 'u1', characterId: 'hiyori' }, profile);
      now += 1000;
      await repo.updateSchedule(
        { userId: 'u1', characterId: 'hiyori' },
        { bedtime: '23:00', wakeUpTime: '08:00' }
      );

      const fetched = await repo.get({ userId: 'u1', characterId: 'hiyori' });
      expect(fetched?.userActivityProfile).toEqual(profile);
    });

    it('既存なしの場合はデフォルト CreatedAt で新規作成する', async () => {
      const result = await repo.updateSchedule(
        { userId: 'u1', characterId: 'hiyori' },
        { bedtime: '23:00', wakeUpTime: '08:00' }
      );

      expect(result.bedtime).toBe('23:00');
      expect(result.wakeUpTime).toBe('08:00');
      expect(result.createdAt).toBe(baseNow);
    });

    it('CreatedAt は保持され UpdatedAt が更新される', async () => {
      await repo.upsert({
        userId: 'u1',
        characterId: 'hiyori',
        bedtime: '01:30',
        wakeUpTime: '09:30',
      });
      now += 5000;
      await repo.updateSchedule(
        { userId: 'u1', characterId: 'hiyori' },
        { bedtime: '23:00', wakeUpTime: '08:00' }
      );

      const fetched = await repo.get({ userId: 'u1', characterId: 'hiyori' });
      expect(fetched?.createdAt).toBe(baseNow);
      expect(fetched?.updatedAt).toBe(baseNow + 5000);
    });
  });
});
