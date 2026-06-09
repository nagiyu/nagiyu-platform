import { InMemorySingleTableStore } from '@nagiyu/aws';
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
    UserID: 'u1',
    NotifID: `NOTIF-${_notifSeq}`,
    CharacterID: 'hiyori',
    Kind: 'normal',
    Title: 'テスト通知',
    Body: 'テスト本文',
    Ttl: Math.floor(BASE_NOW / 1000) + 86400,
    ...overrides,
  };
}

beforeEach(() => {
  _notifSeq = 0;
});

describe('InMemoryNotificationEventRepository', () => {
  describe('put', () => {
    it('エンティティを保存し CreatedAt を付与する', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      const entity = await repo.put(makeInput());

      expect(entity.UserID).toBe('u1');
      expect(entity.CreatedAt).toBe(BASE_NOW);
      expect(entity.Kind).toBe('normal');
    });

    it('critical 種別も保存できる', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      const entity = await repo.put(makeInput({ Kind: 'critical', KnowledgeID: 'k1' }));
      expect(entity.Kind).toBe('critical');
      expect(entity.KnowledgeID).toBe('k1');
    });
  });

  describe('get', () => {
    it('存在するイベントを取得できる', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      const saved = await repo.put(makeInput({ NotifID: 'NOTIF-TEST' }));

      const found = await repo.get({ userId: 'u1', notifId: saved.NotifID });
      expect(found).not.toBeNull();
      expect(found?.Body).toBe('テスト本文');
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
      await repo.put(makeInput({ UserID: 'u2', NotifID: 'NOTIF-U2' }));

      const found = await repo.get({ userId: 'u1', notifId: 'NOTIF-U2' });
      expect(found).toBeNull();
    });
  });

  describe('listByUser', () => {
    it('CreatedAt 降順で返す', async () => {
      const store = makeStore();
      let now = BASE_NOW;
      const repo = makeRepo(store, () => now);

      now = BASE_NOW + 1000;
      const a = await repo.put(makeInput({ NotifID: 'NOTIF-A' }));
      now = BASE_NOW + 2000;
      const b = await repo.put(makeInput({ NotifID: 'NOTIF-B' }));
      now = BASE_NOW + 3000;
      const c = await repo.put(makeInput({ NotifID: 'NOTIF-C' }));

      const list = await repo.listByUser('u1');
      expect(list.map((e) => e.NotifID)).toEqual([c.NotifID, b.NotifID, a.NotifID]);
    });

    it('limit で件数を絞る', async () => {
      const store = makeStore();
      let now = BASE_NOW;
      const repo = makeRepo(store, () => now);
      for (let i = 0; i < 5; i++) {
        now += 1000;
        await repo.put(makeInput({ NotifID: `NOTIF-${i}` }));
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
      await repo.put(makeInput({ UserID: 'u2', NotifID: 'NOTIF-OTHER' }));

      expect(await repo.listByUser('u1')).toEqual([]);
    });
  });

  describe('markConsumed', () => {
    it('consumedAt を更新できる', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      const saved = await repo.put(makeInput({ NotifID: 'NOTIF-CONSUME' }));

      const consumedAt = BASE_NOW + 5000;
      await repo.markConsumed({ userId: 'u1', notifId: saved.NotifID }, consumedAt);

      const found = await repo.get({ userId: 'u1', notifId: saved.NotifID });
      expect(found?.ConsumedAt).toBe(consumedAt);
    });

    it('存在しないイベントへの markConsumed は例外を投げない', async () => {
      const store = makeStore();
      const repo = makeRepo(store);

      await expect(
        repo.markConsumed({ userId: 'u1', notifId: 'NOTIF-MISSING' }, BASE_NOW)
      ).resolves.not.toThrow();
    });
  });

  describe('デフォルト nowMs', () => {
    it('nowMs 省略時は Date.now() が使われる', async () => {
      const store = makeStore();
      const repo = new InMemoryNotificationEventRepository(store);
      const before = Date.now();
      const entity = await repo.put(makeInput({ NotifID: 'NOTIF-DEFAULT' }));
      expect(entity.CreatedAt).toBeGreaterThanOrEqual(before);
    });
  });
});
