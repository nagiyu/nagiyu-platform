import { EntityNotFoundError, InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryNotificationEventRepository } from '../../../src/repositories/in-memory-notification-event.repository.js';
import type { CreateNotificationEventInput } from '../../../src/entities/notification-event.entity.js';

const BASE_NOW = 1_700_000_000_000;

function makeStore() {
  return new InMemorySingleTableStore();
}

function makeRepo(store: InMemorySingleTableStore, nowMs?: () => number) {
  return new InMemoryNotificationEventRepository(store, nowMs ?? (() => BASE_NOW));
}

let _notifSeq = 0;
function makeInput(
  overrides: Partial<CreateNotificationEventInput> = {}
): CreateNotificationEventInput {
  _notifSeq++;
  return {
    userId: 'u1',
    notifId: `NOTIF-${_notifSeq}`,
    characterId: 'hiyori',
    kind: 'normal',
    title: 'テスト通知',
    body: 'テスト本文',
    expiresAt: BASE_NOW + 86_400_000,
    ...overrides,
  };
}

beforeEach(() => {
  _notifSeq = 0;
});

describe('InMemoryNotificationEventRepository', () => {
  describe('put', () => {
    it('エンティティを保存し createdAt を付与する', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      const entity = await repo.put(makeInput());

      expect(entity.userId).toBe('u1');
      expect(entity.createdAt).toBe(BASE_NOW);
      expect(entity.kind).toBe('normal');
    });

    it('critical 種別も保存できる', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      const entity = await repo.put(makeInput({ kind: 'critical' }));
      expect(entity.kind).toBe('critical');
    });
  });

  describe('get', () => {
    it('旧属性名 Ttl だけで保存された Item も読める', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      store.put({
        PK: 'USER#u1',
        SK: 'NOTIF#NOTIF-LEGACY',
        Type: 'NotificationEvent',
        UserID: 'u1',
        NotifID: 'NOTIF-LEGACY',
        CharacterID: 'hiyori',
        Kind: 'normal',
        Title: 'テスト通知',
        Body: 'テスト本文',
        CreatedAt: BASE_NOW,
        UpdatedAt: BASE_NOW,
        Ttl: Math.floor(BASE_NOW / 1000) + 86400,
      });

      const found = await repo.get({ userId: 'u1', notifId: 'NOTIF-LEGACY' });
      expect(found?.expiresAt).toBe(Math.floor(BASE_NOW / 1000) * 1000 + 86_400_000);
    });

    it('存在するイベントを取得できる', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      const saved = await repo.put(makeInput({ notifId: 'NOTIF-TEST' }));

      const found = await repo.get({ userId: 'u1', notifId: saved.notifId });
      expect(found).not.toBeNull();
      expect(found?.body).toBe('テスト本文');
    });

    it('存在しない場合は null を返す', async () => {
      const store = makeStore();
      const repo = makeRepo(store);

      const found = await repo.get({ userId: 'u1', notifId: 'NOTIF-MISSING' });
      expect(found).toBeNull();
    });

    it('別ユーザーのイベントは取得できない', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      await repo.put(makeInput({ userId: 'u2', notifId: 'NOTIF-U2' }));

      const found = await repo.get({ userId: 'u1', notifId: 'NOTIF-U2' });
      expect(found).toBeNull();
    });
  });

  describe('listByUser', () => {
    it('createdAt 降順で返す', async () => {
      const store = makeStore();
      let now = BASE_NOW;
      const repo = makeRepo(store, () => now);

      now = BASE_NOW + 1000;
      const a = await repo.put(makeInput({ notifId: 'NOTIF-A' }));
      now = BASE_NOW + 2000;
      const b = await repo.put(makeInput({ notifId: 'NOTIF-B' }));
      now = BASE_NOW + 3000;
      const c = await repo.put(makeInput({ notifId: 'NOTIF-C' }));

      const list = await repo.listByUser('u1');
      expect(list.map((e) => e.notifId)).toEqual([c.notifId, b.notifId, a.notifId]);
    });

    it('limit で件数を絞る', async () => {
      const store = makeStore();
      let now = BASE_NOW;
      const repo = makeRepo(store, () => now);
      for (let i = 0; i < 5; i++) {
        now += 1000;
        await repo.put(makeInput({ notifId: `NOTIF-${i}` }));
      }

      const list = await repo.listByUser('u1', 3);
      expect(list).toHaveLength(3);
    });

    it('イベントなしは空配列', async () => {
      const store = makeStore();
      const repo = makeRepo(store);

      expect(await repo.listByUser('u1')).toEqual([]);
    });

    it('別ユーザーのイベントは混入しない', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      await repo.put(makeInput({ userId: 'u2', notifId: 'NOTIF-OTHER' }));

      expect(await repo.listByUser('u1')).toEqual([]);
    });

    it('101 件以上でも全件から createdAt 降順で最新のものを返す', async () => {
      const store = makeStore();
      let now = BASE_NOW;
      const repo = makeRepo(store, () => now);
      // SK 昇順の末尾 (= 既定の 100 件で切ると落ちる側) が最新になるよう、通知 ID を作成順に昇順で振る
      for (let i = 0; i < 101; i++) {
        now += 1000;
        await repo.put(makeInput({ notifId: `NOTIF-${String(i).padStart(3, '0')}` }));
      }

      const list = await repo.listByUser('u1', 200);
      expect(list).toHaveLength(101);
      expect(list[0].notifId).toBe('NOTIF-100');
      expect(list[100].notifId).toBe('NOTIF-000');
      expect((await repo.listByUser('u1', 1))[0].notifId).toBe('NOTIF-100');
    });
  });

  describe('markConsumed', () => {
    it('consumedAt を更新できる', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      const saved = await repo.put(makeInput({ notifId: 'NOTIF-CONSUME' }));

      const consumedAt = BASE_NOW + 5000;
      await repo.markConsumed({ userId: 'u1', notifId: saved.notifId }, consumedAt);

      const found = await repo.get({ userId: 'u1', notifId: saved.notifId });
      expect(found?.consumedAt).toBe(consumedAt);
    });
  });

  describe('listLatestUnconsumedByCharacter', () => {
    it('characterIds が空の場合は [] を返す', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      await repo.put(makeInput({ notifId: 'NOTIF-X' }));

      const result = await repo.listLatestUnconsumedByCharacter('u1', []);
      expect(result).toEqual([]);
    });

    it('キャラごとに最新未消化通知 1 件を返す', async () => {
      const store = makeStore();
      let now = BASE_NOW;
      const repo = makeRepo(store, () => now);

      now = BASE_NOW + 1000;
      await repo.put(makeInput({ notifId: 'N-HIY-OLD', characterId: 'hiyori' }));
      now = BASE_NOW + 2000;
      await repo.put(makeInput({ notifId: 'N-HIY-NEW', characterId: 'hiyori' }));
      now = BASE_NOW + 3000;
      await repo.put(makeInput({ notifId: 'N-AGE', characterId: 'ageha' }));

      const result = await repo.listLatestUnconsumedByCharacter('u1', ['hiyori', 'ageha']);
      expect(result).toHaveLength(2);

      const hiyori = result.find((e) => e.characterId === 'hiyori');
      // 最新（createdAt が大きい方）が返ること
      expect(hiyori?.notifId).toBe('N-HIY-NEW');
    });

    it('消化済みイベントはスキップする', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      const saved = await repo.put(makeInput({ notifId: 'NOTIF-CONSUME' }));
      await repo.markConsumed({ userId: 'u1', notifId: saved.notifId }, BASE_NOW + 1000);

      const result = await repo.listLatestUnconsumedByCharacter('u1', ['hiyori']);
      expect(result).toHaveLength(0);
    });

    it('消化済みと未消化が混在する場合、最新未消化を返す', async () => {
      const store = makeStore();
      let now = BASE_NOW;
      const repo = makeRepo(store, () => now);

      // 最新: 消化済み
      now = BASE_NOW + 2000;
      const consumed = await repo.put(makeInput({ notifId: 'N-CONSUMED' }));
      await repo.markConsumed({ userId: 'u1', notifId: consumed.notifId }, now + 100);

      // 2 番目: 未消化
      now = BASE_NOW + 1000;
      await repo.put(makeInput({ notifId: 'N-UNCONSUMED' }));

      const result = await repo.listLatestUnconsumedByCharacter('u1', ['hiyori']);
      expect(result).toHaveLength(1);
      expect(result[0].notifId).toBe('N-UNCONSUMED');
    });

    it('全件走査して未消化を発見する（大量消化済みでも取りこぼさない）', async () => {
      const store = makeStore();
      let now = BASE_NOW;
      const repo = makeRepo(store, () => now);

      // 多数の消化済みを先に（createdAt が新しい順）登録
      for (let i = 100; i >= 1; i--) {
        now = BASE_NOW + i * 1000;
        const e = await repo.put(makeInput({ notifId: `N-CONSUMED-${i}` }));
        await repo.markConsumed({ userId: 'u1', notifId: e.notifId }, now + 100);
      }

      // 最も古い（createdAt が最小）の未消化通知
      now = BASE_NOW;
      await repo.put(makeInput({ notifId: 'N-OLDEST-UNCONSUMED' }));

      const result = await repo.listLatestUnconsumedByCharacter('u1', ['hiyori']);
      expect(result).toHaveLength(1);
      expect(result[0].notifId).toBe('N-OLDEST-UNCONSUMED');
    });

    it('別ユーザーのイベントは混入しない', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      // u2 のイベントのみ
      await repo.put(makeInput({ userId: 'u2', notifId: 'N-U2' }));

      const result = await repo.listLatestUnconsumedByCharacter('u1', ['hiyori']);
      expect(result).toHaveLength(0);
    });
  });

  describe('markConsumed', () => {
    it('consumedAt を記録し、ほかの項目は変えない', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      const saved = await repo.put(makeInput({ notifId: 'N-MARK' }));

      await repo.markConsumed({ userId: 'u1', notifId: 'N-MARK' }, BASE_NOW + 1000);

      const found = await repo.get({ userId: 'u1', notifId: 'N-MARK' });
      expect(found).toEqual({ ...saved, consumedAt: BASE_NOW + 1000 });
    });

    it('対象が存在しない場合は EntityNotFoundError を投げ、欠けたアイテムを作らない', async () => {
      const store = makeStore();
      const repo = makeRepo(store);

      await expect(
        repo.markConsumed({ userId: 'u1', notifId: 'N-MISSING' }, BASE_NOW)
      ).rejects.toBeInstanceOf(EntityNotFoundError);
      expect(await repo.get({ userId: 'u1', notifId: 'N-MISSING' })).toBeNull();
    });
  });

  describe('デフォルト nowMs', () => {
    it('nowMs 省略時は Date.now() が使われる', async () => {
      const store = makeStore();
      const repo = new InMemoryNotificationEventRepository(store);
      const before = Date.now();
      const entity = await repo.put(makeInput({ notifId: 'NOTIF-DEFAULT' }));
      expect(entity.createdAt).toBeGreaterThanOrEqual(before);
    });
  });
});
