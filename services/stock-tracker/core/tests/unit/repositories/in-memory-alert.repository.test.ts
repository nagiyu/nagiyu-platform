/**
 * Stock Tracker Core - InMemory Alert Repository Unit Tests
 *
 * InMemoryAlertRepositoryのユニットテスト
 *
 * 単一アイテムの CRUD の振る舞い (エラー変換など) は EntityStore の責務のため、
 * ここでは Repository 経由で正しく動くことと、GSI の近似クエリ・失効の書き込みだけを検証する。
 */

import { InMemoryAlertRepository } from '../../../src/repositories/in-memory-alert.repository.js';
import { InMemorySingleTableStore, EntityNotFoundError, InvalidEntityDataError } from '@nagiyu/aws';
import { logger } from '@nagiyu/common';
import type { CreateAlertInput } from '../../../src/entities/alert.entity.js';

jest.mock('@nagiyu/common', () => ({
  ...jest.requireActual('@nagiyu/common'),
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

function buildInput(overrides: Partial<CreateAlertInput> = {}): CreateAlertInput {
  return {
    userId: 'user-123',
    tickerId: 'NSDQ:AAPL',
    exchangeId: 'NASDAQ',
    mode: 'Buy',
    frequency: 'MINUTE_LEVEL',
    enabled: true,
    conditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
    subscription: {
      endpoint: 'https://example.com/push',
      keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
    },
    ...overrides,
  };
}

describe('InMemoryAlertRepository', () => {
  let repository: InMemoryAlertRepository;
  let store: InMemorySingleTableStore;

  /** 保存済みのアラートの Subscription を壊す */
  function breakSubscription(userId: string, alertId: string): void {
    const pk = `USER#${userId}`;
    const sk = `ALERT#${alertId}`;
    store.put({ ...(store.get(pk, sk) ?? {}), Subscription: 'broken' } as Parameters<
      typeof store.put
    >[0]);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    store = new InMemorySingleTableStore();
    repository = new InMemoryAlertRepository(store);
  });

  describe('create', () => {
    it('新しいアラートを作成できる', async () => {
      const input = buildInput();

      const result = await repository.create(input);

      expect(result).toMatchObject(input);
      expect(result.alertId).toBeDefined();
      expect(result.createdAt).toBeDefined();
      // updatedAt は EntityStore が書き込み時に採番するため、createdAt と同一ミリ秒とは限らない
      expect(result.updatedAt).toBeGreaterThanOrEqual(result.createdAt);
    });

    it('同じユーザーで複数のアラートを作成でき、アラートIDは互いに異なる', async () => {
      const result1 = await repository.create(buildInput());
      const result2 = await repository.create(buildInput());

      expect(result1.alertId).not.toBe(result2.alertId);
    });
  });

  describe('getById', () => {
    it('存在するアラートを取得できる', async () => {
      const created = await repository.create(buildInput());

      expect(await repository.getById('user-123', created.alertId)).toEqual(created);
    });

    it('存在しないアラートの場合は null を返す', async () => {
      expect(await repository.getById('user-123', 'missing')).toBeNull();
    });

    it('旧属性名 subscription で保存されたアラートも取得できる', async () => {
      const created = await repository.create(buildInput());
      const key = { PK: 'USER#user-123', SK: `ALERT#${created.alertId}` };
      const raw = { ...(store.get(key.PK, key.SK) ?? {}) };
      raw.subscription = raw.Subscription;
      delete raw.Subscription;
      store.put(raw as Parameters<typeof store.put>[0]);

      const result = await repository.getById('user-123', created.alertId);

      expect(result?.subscription).toEqual(created.subscription);
    });
  });

  describe('getByUserId', () => {
    it('ユーザーのアラート一覧だけを取得できる', async () => {
      await repository.create(buildInput({ userId: 'user-123', tickerId: 'NSDQ:AAPL' }));
      await repository.create(buildInput({ userId: 'user-123', tickerId: 'NSDQ:NVDA' }));
      await repository.create(buildInput({ userId: 'user-456' }));

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(2);
      expect(result.items.every((alert) => alert.userId === 'user-123')).toBe(true);
    });

    it('読めないアイテムは警告ログを出して読み飛ばし、他のアラートは返す', async () => {
      const normal = await repository.create(buildInput({ tickerId: 'NSDQ:AAPL' }));
      const broken = await repository.create(buildInput({ tickerId: 'NSDQ:NVDA' }));
      breakSubscription('user-123', broken.alertId);

      const result = await repository.getByUserId('user-123');

      expect(result.items.map((alert) => alert.alertId)).toEqual([normal.alertId]);
      expect(result.count).toBe(1);
      expect(logger.warn).toHaveBeenCalledWith(
        '無効なアラートデータをスキップしました',
        expect.objectContaining({ sk: `ALERT#${broken.alertId}` })
      );
    });

    it('該当するユーザーのアラートがない場合は空配列を返す', async () => {
      const result = await repository.getByUserId('user-notfound');

      expect(result.items).toHaveLength(0);
    });

    it('ページネーションが動作する', async () => {
      for (let i = 0; i < 5; i++) {
        await repository.create(buildInput({ tickerId: `NSDQ:TEST${i}` }));
      }

      const page1 = await repository.getByUserId('user-123', { limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).toBeDefined();

      const page2 = await repository.getByUserId('user-123', {
        limit: 2,
        cursor: page1.nextCursor,
      });
      expect(page2.items).toHaveLength(2);
    });

    it('limit 未指定時は DynamoDB 実装と同じ 50 件で打ち切る', async () => {
      for (let i = 0; i < 60; i++) {
        await repository.create(buildInput());
      }

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(50);
      expect(result.nextCursor).toBeDefined();
    });

    it('limit が 0 のときも既定の 50 件にフォールバックする', async () => {
      for (let i = 0; i < 60; i++) {
        await repository.create(buildInput());
      }

      const result = await repository.getByUserId('user-123', { limit: 0 });

      expect(result.items).toHaveLength(50);
    });

    it('論理削除待ち (markTemporaryAsExpired で expiresAt 設定済み) のアラートは結果から除外される', async () => {
      const userDisabled = await repository.create(buildInput({ enabled: false }));
      const pendingDeletion = await repository.create(
        buildInput({ temporary: true, temporaryExpireDate: '2026-03-04' })
      );
      await repository.markTemporaryAsExpired('user-123', pendingDeletion.alertId, 1234567890000);

      const result = await repository.getByUserId('user-123');

      const ids = result.items.map((alert) => alert.alertId);
      expect(ids).toContain(userDisabled.alertId);
      expect(ids).not.toContain(pendingDeletion.alertId);
    });

    it('ユーザーが手動で無効化したアラート (enabled=false、expiresAt なし) は引き続き返る', async () => {
      await repository.create(buildInput({ enabled: true }));
      await repository.create(buildInput({ enabled: false }));

      const result = await repository.getByUserId('user-123');

      expect(result.items.map((alert) => alert.enabled).sort()).toEqual([false, true]);
    });

    it('markTemporaryAsExpired のあとに別の項目を update しても、除外されたままになる', async () => {
      const alert = await repository.create(buildInput({ temporary: true }));
      await repository.markTemporaryAsExpired('user-123', alert.alertId, 1234567890000);

      await repository.update('user-123', alert.alertId, { customMessage: 'メモ' });

      const result = await repository.getByUserId('user-123');
      expect(result.items).toHaveLength(0);
    });
  });

  describe('getByFrequency', () => {
    it('頻度ごとのアラート一覧を取得できる', async () => {
      await repository.create(buildInput({ userId: 'user-a', frequency: 'MINUTE_LEVEL' }));
      await repository.create(buildInput({ userId: 'user-b', frequency: 'MINUTE_LEVEL' }));
      await repository.create(buildInput({ userId: 'user-c', frequency: 'HOURLY_LEVEL' }));

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result).toHaveLength(2);
      expect(result.every((alert) => alert.frequency === 'MINUTE_LEVEL')).toBe(true);
    });

    it('読めないアイテムは警告ログを出して読み飛ばし、他のアラートは返す', async () => {
      const normal = await repository.create(buildInput({ userId: 'user-a' }));
      const broken = await repository.create(buildInput({ userId: 'user-b' }));
      breakSubscription('user-b', broken.alertId);

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result.map((alert) => alert.alertId)).toEqual([normal.alertId]);
      expect(logger.warn).toHaveBeenCalledWith(
        '無効なアラートデータをスキップしました',
        expect.objectContaining({ sk: `ALERT#${broken.alertId}` })
      );
    });

    it('該当する頻度のアラートがない場合は空配列を返す', async () => {
      expect(await repository.getByFrequency('HOURLY_LEVEL')).toEqual([]);
    });

    it('51 件以上のアラートも全件返す', async () => {
      for (let i = 0; i < 130; i++) {
        await repository.create(buildInput({ userId: `user-${String(i).padStart(4, '0')}` }));
      }

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result).toHaveLength(130);
    });

    it('frequency を update すると、新しい頻度の側に移る', async () => {
      const alert = await repository.create(buildInput({ frequency: 'MINUTE_LEVEL' }));

      await repository.update('user-123', alert.alertId, { frequency: 'HOURLY_LEVEL' });

      expect(await repository.getByFrequency('MINUTE_LEVEL')).toEqual([]);
      expect((await repository.getByFrequency('HOURLY_LEVEL')).map((item) => item.alertId)).toEqual(
        [alert.alertId]
      );
    });
  });

  describe('getAllForSubscriptionAudit', () => {
    it('両方の頻度のアラートを、ページを辿り切って全件返す', async () => {
      for (let i = 0; i < 130; i++) {
        await repository.create(buildInput({ userId: `user-${String(i).padStart(4, '0')}` }));
      }
      await repository.create(buildInput({ userId: 'user-h', frequency: 'HOURLY_LEVEL' }));

      const result = await repository.getAllForSubscriptionAudit();

      expect(result.alerts).toHaveLength(131);
      expect(result.unreadable).toEqual([]);
    });

    it('読めないアイテムは捨てずに、userId / alertId と保存キー、理由を付けて返す', async () => {
      const normal = await repository.create(buildInput({ userId: 'user-a' }));
      const broken = await repository.create(
        buildInput({ userId: 'user-b', frequency: 'HOURLY_LEVEL' })
      );
      breakSubscription('user-b', broken.alertId);

      const result = await repository.getAllForSubscriptionAudit();

      expect(result.alerts.map((alert) => alert.alertId)).toEqual([normal.alertId]);
      expect(result.unreadable).toEqual([
        {
          userId: 'user-b',
          alertId: broken.alertId,
          pk: 'USER#user-b',
          sk: `ALERT#${broken.alertId}`,
          reason: expect.any(String),
        },
      ]);
    });

    it('userId / alertId が取れないアイテムは、保存キーだけで特定できるようにして返す', async () => {
      const alert = await repository.create(buildInput());
      const pk = 'USER#user-123';
      const sk = `ALERT#${alert.alertId}`;
      const raw = { ...(store.get(pk, sk) ?? {}) };
      delete raw.AlertID;
      delete raw.UserID;
      store.put(raw as Parameters<typeof store.put>[0]);

      const result = await repository.getAllForSubscriptionAudit();

      expect(result.alerts).toEqual([]);
      expect(result.unreadable).toEqual([{ pk, sk, reason: expect.any(String) }]);
    });

    it('該当するアラートがない場合は空の結果を返す', async () => {
      expect(await repository.getAllForSubscriptionAudit()).toEqual({
        alerts: [],
        unreadable: [],
      });
    });
  });

  describe('update', () => {
    it('アラートを更新できる', async () => {
      const created = await repository.create(buildInput());
      // 確実にタイムスタンプが異なるように待機
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await repository.update('user-123', created.alertId, {
        enabled: false,
        logicalOperator: 'AND',
      });

      expect(updated.enabled).toBe(false);
      expect(updated.logicalOperator).toBe('AND');
      expect(updated.mode).toBe('Buy'); // 更新されていないフィールド
      expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
      expect(updated.createdAt).toBe(created.createdAt);
    });

    it('null を渡した任意項目は未設定に戻る', async () => {
      const created = await repository.create(
        buildInput({
          customMessage: 'メモ',
          temporary: true,
          temporaryExpireDate: '2026-03-04',
        })
      );

      const updated = await repository.update('user-123', created.alertId, {
        customMessage: null,
        temporary: false,
        temporaryExpireDate: null,
      });

      expect(updated).not.toHaveProperty('customMessage');
      expect(updated).not.toHaveProperty('temporaryExpireDate');
      expect(updated.temporary).toBeUndefined();
    });

    it('サブスクリプションを更新すると、旧属性名 subscription で保存されていても二重に残らない', async () => {
      const created = await repository.create(buildInput());
      const pk = 'USER#user-123';
      const sk = `ALERT#${created.alertId}`;
      const raw = { ...(store.get(pk, sk) ?? {}) };
      raw.subscription = raw.Subscription;
      delete raw.Subscription;
      store.put(raw as Parameters<typeof store.put>[0]);
      const subscription = {
        endpoint: 'https://example.com/new',
        keys: { p256dh: 'new-p256dh', auth: 'new-auth' },
      };

      const updated = await repository.update('user-123', created.alertId, { subscription });

      expect(updated.subscription).toEqual(subscription);
      const stored = store.get(pk, sk);
      expect(stored?.Subscription).toEqual(subscription);
      expect(stored).not.toHaveProperty('subscription');
    });
  });

  describe('delete', () => {
    it('アラートを削除できる', async () => {
      const created = await repository.create(buildInput());

      await repository.delete('user-123', created.alertId);

      expect(await repository.getById('user-123', created.alertId)).toBeNull();
    });
  });

  describe('getTemporaryCandidatesByFrequency', () => {
    const temporaryInput = (overrides: Partial<CreateAlertInput> = {}) =>
      buildInput({ temporary: true, temporaryExpireDate: '2026-03-04', ...overrides });

    it('temporary=true かつ expiresAt 未設定のアラートを候補として返す (enabled は問わない)', async () => {
      const temporaryEnabled = await repository.create(temporaryInput());
      await repository.create(buildInput()); // temporary なし
      const temporaryUserDisabled = await repository.create(temporaryInput({ enabled: false }));

      const result = await repository.getTemporaryCandidatesByFrequency('MINUTE_LEVEL');

      expect(result.items.map((candidate) => candidate.alertId).sort()).toEqual(
        [temporaryEnabled.alertId, temporaryUserDisabled.alertId].sort()
      );
    });

    it('候補を軽量エンティティで返す', async () => {
      const alert = await repository.create(temporaryInput());

      const result = await repository.getTemporaryCandidatesByFrequency('MINUTE_LEVEL');

      expect(result.items).toEqual([
        {
          alertId: alert.alertId,
          userId: 'user-123',
          exchangeId: 'NASDAQ',
          frequency: 'MINUTE_LEVEL',
          enabled: true,
          temporary: true,
          temporaryExpireDate: '2026-03-04',
        },
      ]);
    });

    it('expiresAt が既に設定済み (markTemporaryAsExpired 済み) のアラートは候補に含めない', async () => {
      const expired = await repository.create(temporaryInput());
      await repository.markTemporaryAsExpired('user-123', expired.alertId, 9999999999000);

      const result = await repository.getTemporaryCandidatesByFrequency('MINUTE_LEVEL');

      expect(result.items.map((candidate) => candidate.alertId)).not.toContain(expired.alertId);
    });

    it('他の頻度のアラートは候補に含めない', async () => {
      await repository.create(temporaryInput({ frequency: 'HOURLY_LEVEL' }));

      const result = await repository.getTemporaryCandidatesByFrequency('MINUTE_LEVEL');

      expect(result.items).toEqual([]);
    });

    it('検証に失敗するアイテムはスキップする', async () => {
      const alert = await repository.create(temporaryInput());
      const pk = 'USER#user-123';
      const sk = `ALERT#${alert.alertId}`;
      const raw = { ...(store.get(pk, sk) ?? {}) };
      delete raw.TemporaryExpireDate;
      store.put(raw as Parameters<typeof store.put>[0]);

      const result = await repository.getTemporaryCandidatesByFrequency('MINUTE_LEVEL');

      expect(result.items).toEqual([]);
    });

    it('limit 未指定時は DynamoDB 実装と同じ 50 件で打ち切る', async () => {
      for (let i = 0; i < 60; i++) {
        await repository.create(temporaryInput({ userId: `user-${String(i).padStart(4, '0')}` }));
      }

      const result = await repository.getTemporaryCandidatesByFrequency('MINUTE_LEVEL');

      expect(result.items).toHaveLength(50);
      expect(result.nextCursor).toBeDefined();
    });
  });

  describe('markTemporaryAsExpired', () => {
    it('enabled を false に更新し、expiresAt を TTL 属性 (エポック秒) としてストアにセットする', async () => {
      const created = await repository.create(
        buildInput({ temporary: true, temporaryExpireDate: '2026-03-04' })
      );

      await repository.markTemporaryAsExpired('user-123', created.alertId, 1700000000999);

      const after = await repository.getById('user-123', created.alertId);
      expect(after?.enabled).toBe(false);
      expect(after?.expiresAt).toBe(1700000000000);
      expect(store.get('USER#user-123', `ALERT#${created.alertId}`)?.TTL).toBe(1700000000);
    });

    it('対象アラートが存在しない場合は EntityNotFoundError', async () => {
      await expect(repository.markTemporaryAsExpired('user-123', 'missing', 1)).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('サブスクリプションが壊れたアラートは、失効の書き込みは完了したうえで InvalidEntityDataError を投げる', async () => {
      const created = await repository.create(buildInput({ temporary: true }));
      breakSubscription('user-123', created.alertId);

      await expect(
        repository.markTemporaryAsExpired('user-123', created.alertId, 1700000000000)
      ).rejects.toThrow(InvalidEntityDataError);

      const stored = store.get('USER#user-123', `ALERT#${created.alertId}`);
      expect(stored?.Enabled).toBe(false);
      expect(stored?.TTL).toBe(1700000000);
    });
  });

  describe('複数リポジトリでのストア共有', () => {
    it('同じストアを使う複数のリポジトリでデータを共有できる', async () => {
      const repository2 = new InMemoryAlertRepository(store);

      const created = await repository.create(buildInput());
      const result = await repository2.getById('user-123', created.alertId);

      expect(result).not.toBeNull();
      expect(result?.alertId).toBe(created.alertId);
    });
  });
});
