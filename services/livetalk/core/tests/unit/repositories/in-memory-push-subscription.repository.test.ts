import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryPushSubscriptionRepository } from '../../../src/repositories/in-memory-push-subscription.repository.js';
import type { CreatePushSubscriptionInput } from '../../../src/entities/push-subscription.entity.js';

const BASE_NOW = 1_700_000_000_000;

function makeStore() {
  return new InMemorySingleTableStore();
}

function makeRepo(store: InMemorySingleTableStore, nowMs?: () => number) {
  return new InMemoryPushSubscriptionRepository(store, nowMs ?? (() => BASE_NOW));
}

function makeSub(
  overrides: Partial<CreatePushSubscriptionInput> = {}
): CreatePushSubscriptionInput {
  return {
    userId: 'u1',
    subscriptionId: 'sub_abc123',
    endpoint: 'https://push.example.com/sub1',
    p256dhKey: 'p256-key',
    authKey: 'auth-key',
    ...overrides,
  };
}

describe('InMemoryPushSubscriptionRepository', () => {
  describe('put', () => {
    it('エンティティを保存し CreatedAt / UpdatedAt を付与する', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      const entity = await repo.put(makeSub());

      expect(entity.userId).toBe('u1');
      expect(entity.subscriptionId).toBe('sub_abc123');
      expect(entity.createdAt).toBe(BASE_NOW);
      expect(entity.updatedAt).toBe(BASE_NOW);
    });

    it('同じ SubscriptionID で上書き保存できる', async () => {
      const store = makeStore();
      let now = BASE_NOW;
      const repo = makeRepo(store, () => now);

      await repo.put(makeSub({ endpoint: 'https://push.example.com/v1' }));
      now += 1000;
      const updated = await repo.put(makeSub({ endpoint: 'https://push.example.com/v2' }));

      expect(updated.endpoint).toBe('https://push.example.com/v2');
      expect(updated.updatedAt).toBe(now);
    });
  });

  describe('get', () => {
    it('存在するサブスクリプションを取得できる', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      await repo.put(makeSub());

      const found = await repo.get({ userId: 'u1', subscriptionId: 'sub_abc123' });
      expect(found).not.toBeNull();
      expect(found?.endpoint).toBe('https://push.example.com/sub1');
    });

    it('存在しない場合は null を返す', async () => {
      const store = makeStore();
      const repo = makeRepo(store);

      const found = await repo.get({ userId: 'u1', subscriptionId: 'sub_missing' });
      expect(found).toBeNull();
    });

    it('別ユーザーのサブスクリプションは取得できない', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      await repo.put(makeSub({ userId: 'u2' }));

      const found = await repo.get({ userId: 'u1', subscriptionId: 'sub_abc123' });
      expect(found).toBeNull();
    });
  });

  describe('listByUser', () => {
    it('ユーザーの全サブスクリプションを返す', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      await repo.put(makeSub({ subscriptionId: 'sub_1', endpoint: 'https://push.example.com/1' }));
      await repo.put(makeSub({ subscriptionId: 'sub_2', endpoint: 'https://push.example.com/2' }));

      const list = await repo.listByUser('u1');
      expect(list).toHaveLength(2);
    });

    it('サブスクリプションなしは空配列', async () => {
      const store = makeStore();
      const repo = makeRepo(store);

      const list = await repo.listByUser('u1');
      expect(list).toEqual([]);
    });

    it('別ユーザーのサブスクリプションは混入しない', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      await repo.put(makeSub({ userId: 'u2', subscriptionId: 'sub_other' }));

      const list = await repo.listByUser('u1');
      expect(list).toEqual([]);
    });
  });

  describe('delete', () => {
    it('サブスクリプションを削除できる', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      await repo.put(makeSub());

      await repo.delete({ userId: 'u1', subscriptionId: 'sub_abc123' });
      const found = await repo.get({ userId: 'u1', subscriptionId: 'sub_abc123' });
      expect(found).toBeNull();
    });

    it('存在しないキーの削除は例外を投げない', async () => {
      const store = makeStore();
      const repo = makeRepo(store);

      await expect(
        repo.delete({ userId: 'u1', subscriptionId: 'sub_missing' })
      ).resolves.not.toThrow();
    });

    it('削除後も他のサブスクリプションは残る', async () => {
      const store = makeStore();
      const repo = makeRepo(store);
      await repo.put(makeSub({ subscriptionId: 'sub_1', endpoint: 'https://push.example.com/1' }));
      await repo.put(makeSub({ subscriptionId: 'sub_2', endpoint: 'https://push.example.com/2' }));

      await repo.delete({ userId: 'u1', subscriptionId: 'sub_1' });
      const list = await repo.listByUser('u1');
      expect(list).toHaveLength(1);
      expect(list[0].subscriptionId).toBe('sub_2');
    });
  });

  describe('デフォルト nowMs', () => {
    it('nowMs 省略時は Date.now() が使われる', async () => {
      const store = makeStore();
      const repo = new InMemoryPushSubscriptionRepository(store);
      const before = Date.now();
      const entity = await repo.put(makeSub());
      expect(entity.createdAt).toBeGreaterThanOrEqual(before);
    });
  });
});
