import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryMessageRepository } from '../../../src/repositories/in-memory-message.repository.js';
import { InMemoryLifecycleRepository } from '../../../src/repositories/in-memory-lifecycle.repository.js';
import { learnUserActivity } from '../../../src/usecases/learn-user-activity.usecase.js';

const BASE_NOW_MS = 1_750_000_000_000;
// JST 2026-01-01 21:00:00 相当（UTC 12:00）
const JST_21_UTC_MS = Date.UTC(2026, 0, 1, 12, 0, 0);

let tick = BASE_NOW_MS;

const makeStore = () => {
  tick = BASE_NOW_MS;
  const store = new InMemorySingleTableStore();
  return store;
};

const makeMessageRepo = (store: InMemorySingleTableStore) => {
  const ulidFactory = () => `ULID-${tick++}`;
  return new InMemoryMessageRepository(store, ulidFactory, () => tick);
};

const makeLifecycleRepo = (store: InMemorySingleTableStore) =>
  new InMemoryLifecycleRepository(store, () => tick);

// JST HH:00 のメッセージをN件作成（CreatedAt は UTC ms）
function makeJstMessages(store: InMemorySingleTableStore, jstHour: number, count: number) {
  const ulidFactory = () => `ULID-${tick++}`;
  const messageRepo = new InMemoryMessageRepository(store, ulidFactory, () => tick);
  const utcBase = Date.UTC(2025, 11, 31, 15, 0, 0) + jstHour * 3600 * 1000; // JST 0:00 UTC + offset
  const msgs: Promise<unknown>[] = [];
  for (let i = 0; i < count; i++) {
    tick = utcBase + i * 60000;
    msgs.push(
      messageRepo.create({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Role: 'user',
        Text: `msg ${i}`,
      })
    );
  }
  return Promise.all(msgs);
}

describe('learnUserActivity', () => {
  it('サンプル数が閾値未満の場合は skipped を返す', async () => {
    const store = makeStore();
    const messageRepo = makeMessageRepo(store);
    const lifecycleRepo = makeLifecycleRepo(store);

    // 4 件（閾値 5 未満）
    for (let i = 0; i < 4; i++) {
      tick = BASE_NOW_MS + i * 1000;
      await messageRepo.create({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Role: 'user',
        Text: 'hi',
      });
    }

    const result = await learnUserActivity('u1', 'hiyori', {
      messageRepo,
      lifecycleRepo,
      now: () => new Date(BASE_NOW_MS),
    });

    expect(result).toBe('skipped');
    const lc = await lifecycleRepo.get({ userId: 'u1', characterId: 'hiyori' });
    expect(lc).toBeNull();
  });

  it('role=assistant のメッセージはカウントしない', async () => {
    const store = makeStore();
    const ulidFactory = () => `ULID-${tick++}`;
    const messageRepo = new InMemoryMessageRepository(store, ulidFactory, () => tick);
    const lifecycleRepo = makeLifecycleRepo(store);

    // assistant を 10 件、user を 3 件
    for (let i = 0; i < 10; i++) {
      tick = BASE_NOW_MS + i * 1000;
      await messageRepo.create({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Role: 'assistant',
        Text: 'hello',
      });
    }
    for (let i = 0; i < 3; i++) {
      tick = BASE_NOW_MS + 10000 + i * 1000;
      await messageRepo.create({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Role: 'user',
        Text: 'user msg',
      });
    }

    const result = await learnUserActivity('u1', 'hiyori', {
      messageRepo,
      lifecycleRepo,
      now: () => new Date(BASE_NOW_MS + 20000),
    });

    expect(result).toBe('skipped');
  });

  it('サンプル充足時に learned を返し userActivityProfile を保存する', async () => {
    const store = makeStore();
    const lifecycleRepo = makeLifecycleRepo(store);

    // JST 21 時に 5 件（evening peak）
    await makeJstMessages(store, 21, 5);

    const nowDate = new Date(JST_21_UTC_MS + 100 * 24 * 3600 * 1000);
    const result = await learnUserActivity('u1', 'hiyori', {
      messageRepo: makeMessageRepo(store),
      lifecycleRepo,
      now: () => nowDate,
      sampleSizeThreshold: 5,
      lookbackDays: 200,
    });

    expect(result).toBe('learned');
    const lc = await lifecycleRepo.get({ userId: 'u1', characterId: 'hiyori' });
    expect(lc?.UserActivityProfile).toBeDefined();
    expect(lc?.UserActivityProfile?.eveningPeak).toBe('21:00');
    expect(lc?.UserActivityProfile?.sampleSize).toBe(5);
    expect(lc?.UserActivityProfile?.lastLearnedAt).toBe(nowDate.toISOString());
  });

  it('morning peak が 5〜12 の範囲で推定される', async () => {
    const store = makeStore();
    const lifecycleRepo = makeLifecycleRepo(store);

    // JST 8 時に 6 件（morning peak）
    await makeJstMessages(store, 8, 6);

    const nowDate = new Date(JST_21_UTC_MS + 100 * 24 * 3600 * 1000);
    await learnUserActivity('u1', 'hiyori', {
      messageRepo: makeMessageRepo(store),
      lifecycleRepo,
      now: () => nowDate,
      lookbackDays: 200,
    });

    const lc = await lifecycleRepo.get({ userId: 'u1', characterId: 'hiyori' });
    expect(lc?.UserActivityProfile?.morningPeak).toBe('08:00');
  });

  it('範囲内データなしの場合はデフォルト値（08:00 / 21:00）にフォールバックする', async () => {
    const store = makeStore();
    const ulidFactory = () => `ULID-${tick++}`;
    const messageRepo = new InMemoryMessageRepository(store, ulidFactory, () => tick);
    const lifecycleRepo = makeLifecycleRepo(store);

    // JST 14 時のみ（morning/evening どちらの範囲にも入らない）
    const utc14 = Date.UTC(2025, 11, 31, 5, 0, 0); // JST 14:00 = UTC 05:00
    for (let i = 0; i < 5; i++) {
      tick = utc14 + i * 60000;
      await messageRepo.create({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Role: 'user',
        Text: `msg ${i}`,
      });
    }

    const nowDate = new Date(utc14 + 100 * 24 * 3600 * 1000);
    await learnUserActivity('u1', 'hiyori', {
      messageRepo,
      lifecycleRepo,
      now: () => nowDate,
      lookbackDays: 200,
    });

    const lc = await lifecycleRepo.get({ userId: 'u1', characterId: 'hiyori' });
    expect(lc?.UserActivityProfile?.morningPeak).toBe('08:00');
    expect(lc?.UserActivityProfile?.eveningPeak).toBe('21:00');
  });

  it('既存 LIFECYCLE の Bedtime/WakeUpTime は適応方向に shift される（Phase 4d）', async () => {
    const store = makeStore();
    const lifecycleRepo = makeLifecycleRepo(store);

    tick = BASE_NOW_MS;
    await lifecycleRepo.upsert({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Bedtime: '02:00',
      WakeUpTime: '10:00',
    });

    // JST 21 時に集中 → eveningPeak=21:00、morningPeak=デフォルト 08:00
    await makeJstMessages(store, 21, 5);

    const nowDate = new Date(JST_21_UTC_MS + 100 * 24 * 3600 * 1000);
    await learnUserActivity('u1', 'hiyori', {
      messageRepo: makeMessageRepo(store),
      lifecycleRepo,
      now: () => nowDate,
      lookbackDays: 200,
    });

    const lc = await lifecycleRepo.get({ userId: 'u1', characterId: 'hiyori' });
    // targetBedtime = 22:30、smoothing=0.3 なので 02:00 → 22:30 方向に shift
    // current=02:00(120min)、diff の最短路は後方向(-210min) → 00:57 付近
    expect(lc?.Bedtime).not.toBe('02:00'); // 変化している
    // UserActivityProfile は保持される
    expect(lc?.UserActivityProfile).toBeDefined();
    expect(lc?.UserActivityProfile?.eveningPeak).toBe('21:00');
  });

  describe('Phase 4d: スケジュール適応', () => {
    it('learned 後に Bedtime/WakeUpTime が shift される', async () => {
      const store = makeStore();
      const lifecycleRepo = makeLifecycleRepo(store);

      // 事前に既存ライフサイクルを作成
      tick = BASE_NOW_MS;
      await lifecycleRepo.upsert({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Bedtime: '01:30',
        WakeUpTime: '09:30',
      });

      // morningPeak=09:00 に集中するメッセージを作成（JST 9時 = UTC 0時）
      await makeJstMessages(store, 9, 5);

      const nowDate = new Date(JST_21_UTC_MS + 100 * 24 * 3600 * 1000);
      await learnUserActivity('u1', 'hiyori', {
        messageRepo: makeMessageRepo(store),
        lifecycleRepo,
        now: () => nowDate,
        lookbackDays: 200,
      });

      const lc = await lifecycleRepo.get({ userId: 'u1', characterId: 'hiyori' });
      // target wakeUpTime = 09:00 - 1h = 08:00; 09:30 より早くなっているはず
      const wakeUpMin = lc!.WakeUpTime.split(':').reduce((h, m, i) =>
        i === 0 ? Number(m) * 60 : Number(m) + h, 0);
      expect(wakeUpMin).toBeLessThan(9 * 60 + 30);
    });

    it('learned 後に UserActivityProfile が保持される', async () => {
      const store = makeStore();
      const lifecycleRepo = makeLifecycleRepo(store);

      await makeJstMessages(store, 21, 5);

      const nowDate = new Date(JST_21_UTC_MS + 100 * 24 * 3600 * 1000);
      await learnUserActivity('u1', 'hiyori', {
        messageRepo: makeMessageRepo(store),
        lifecycleRepo,
        now: () => nowDate,
        lookbackDays: 200,
      });

      const lc = await lifecycleRepo.get({ userId: 'u1', characterId: 'hiyori' });
      expect(lc?.UserActivityProfile).toBeDefined();
      expect(lc?.UserActivityProfile?.eveningPeak).toBe('21:00');
    });
  });

  it('lookbackDays 外のメッセージはカウントされない', async () => {
    const store = makeStore();
    const ulidFactory = () => `ULID-${tick++}`;
    const messageRepo = new InMemoryMessageRepository(store, ulidFactory, () => tick);
    const lifecycleRepo = makeLifecycleRepo(store);

    const oldMs = BASE_NOW_MS - 60 * 24 * 3600 * 1000; // 60 日前
    for (let i = 0; i < 5; i++) {
      tick = oldMs + i * 1000;
      await messageRepo.create({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Role: 'user',
        Text: 'old msg',
      });
    }

    const result = await learnUserActivity('u1', 'hiyori', {
      messageRepo,
      lifecycleRepo,
      now: () => new Date(BASE_NOW_MS),
      lookbackDays: 30, // 30 日以内のみ
    });

    expect(result).toBe('skipped');
  });
});
