/**
 * Stock Tracker Core - InMemory Alert Repository Unit Tests
 *
 * InMemoryAlertRepositoryのユニットテスト
 */

import { InMemoryAlertRepository } from '../../../src/repositories/in-memory-alert.repository.js';
import {
  InMemorySingleTableStore,
  EntityAlreadyExistsError,
  EntityNotFoundError,
  DatabaseError,
} from '@nagiyu/aws';
import type { CreateAlertInput } from '../../../src/entities/alert.entity.js';

describe('InMemoryAlertRepository', () => {
  let repository: InMemoryAlertRepository;
  let store: InMemorySingleTableStore;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryAlertRepository(store);
  });

  describe('create', () => {
    it('新しいアラートを作成できる', async () => {
      const input: CreateAlertInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
      };

      const result = await repository.create(input);

      expect(result).toMatchObject(input);
      expect(result.AlertID).toBeDefined();
      expect(result.CreatedAt).toBeDefined();
      expect(result.UpdatedAt).toBeDefined();
      expect(result.CreatedAt).toBe(result.UpdatedAt);
    });

    it('複数のアラートを同じユーザーで作成できる', async () => {
      const input1: CreateAlertInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
      };

      const input2: CreateAlertInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 500.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
      };

      const result1 = await repository.create(input1);
      const result2 = await repository.create(input2);

      expect(result1.AlertID).not.toBe(result2.AlertID);
      expect(result1.TickerID).toBe('NSDQ:AAPL');
      expect(result2.TickerID).toBe('NSDQ:NVDA');
    });
  });

  describe('getById', () => {
    it('存在するアラートを取得できる', async () => {
      const input: CreateAlertInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
      };

      const created = await repository.create(input);
      const result = await repository.getById('user-123', created.AlertID);

      expect(result).toEqual(created);
    });

    it('存在しないアラートの場合はnullを返す', async () => {
      const result = await repository.getById('user-123', 'alert-notfound');

      expect(result).toBeNull();
    });
  });

  describe('getByUserId', () => {
    it('ユーザーのアラート一覧を取得できる', async () => {
      const alert1: CreateAlertInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
      };

      const alert2: CreateAlertInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 500.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
      };

      const alert3: CreateAlertInput = {
        UserID: 'user-456',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 140.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
      };

      await repository.create(alert1);
      await repository.create(alert2);
      await repository.create(alert3);

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].UserID).toBe('user-123');
      expect(result.items[1].UserID).toBe('user-123');
    });

    it('該当するユーザーのアラートがない場合は空配列を返す', async () => {
      const result = await repository.getByUserId('user-notfound');

      expect(result.items).toHaveLength(0);
    });

    it('ページネーションオプションが機能する', async () => {
      // 複数のアラートを作成
      for (let i = 0; i < 5; i++) {
        await repository.create({
          UserID: 'user-123',
          TickerID: `NSDQ:TEST${i}`,
          ExchangeID: 'NASDAQ',
          Mode: 'Buy',
          Frequency: 'MINUTE_LEVEL',
          Enabled: true,
          ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
          SubscriptionEndpoint: 'https://example.com/push',
          SubscriptionKeysP256dh: 'p256dh-key',
          SubscriptionKeysAuth: 'auth-secret',
        });
      }

      const result1 = await repository.getByUserId('user-123', { limit: 2 });
      expect(result1.items).toHaveLength(2);
      expect(result1.nextCursor).toBeDefined();

      const result2 = await repository.getByUserId('user-123', {
        limit: 2,
        cursor: result1.nextCursor,
      });
      expect(result2.items).toHaveLength(2);
    });
  });

  describe('getByFrequency', () => {
    it('頻度ごとのアラート一覧を取得できる', async () => {
      const alert1: CreateAlertInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
      };

      const alert2: CreateAlertInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 500.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
      };

      const alert3: CreateAlertInput = {
        UserID: 'user-456',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 140.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
      };

      await repository.create(alert1);
      await repository.create(alert2);
      await repository.create(alert3);

      const minuteResult = await repository.getByFrequency('MINUTE_LEVEL');
      expect(minuteResult.items).toHaveLength(2);
      expect(minuteResult.items[0].Frequency).toBe('MINUTE_LEVEL');
      expect(minuteResult.items[1].Frequency).toBe('MINUTE_LEVEL');

      const hourlyResult = await repository.getByFrequency('HOURLY_LEVEL');
      expect(hourlyResult.items).toHaveLength(1);
      expect(hourlyResult.items[0].Frequency).toBe('HOURLY_LEVEL');
    });

    it('該当する頻度のアラートがない場合は空配列を返す', async () => {
      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result.items).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('アラートを更新できる', async () => {
      const input: CreateAlertInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
      };

      const created = await repository.create(input);
      // 確実にタイムスタンプが異なるように待機
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await repository.update('user-123', created.AlertID, {
        Enabled: false,
        ConditionList: [{ field: 'price', operator: 'lte', value: 140.0 }],
      });

      expect(result.Enabled).toBe(false);
      expect(result.ConditionList[0].value).toBe(140.0);
      expect(result.Mode).toBe('Buy'); // 更新されていないフィールド
      expect(result.UpdatedAt).toBeGreaterThan(result.CreatedAt);
    });

    it('存在しないアラートを更新しようとするとEntityNotFoundErrorをスローする', async () => {
      await expect(
        repository.update('user-123', 'alert-notfound', { Enabled: false })
      ).rejects.toThrow(EntityNotFoundError);
    });

    it('更新するフィールドがない場合はDatabaseErrorをスローする', async () => {
      const input: CreateAlertInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
      };

      const created = await repository.create(input);

      await expect(repository.update('user-123', created.AlertID, {})).rejects.toThrow(
        DatabaseError
      );
    });
  });

  describe('delete', () => {
    it('アラートを削除できる', async () => {
      const input: CreateAlertInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
      };

      const created = await repository.create(input);
      await repository.delete('user-123', created.AlertID);

      const result = await repository.getById('user-123', created.AlertID);
      expect(result).toBeNull();
    });

    it('存在しないアラートを削除しようとするとEntityNotFoundErrorをスローする', async () => {
      await expect(repository.delete('user-123', 'alert-notfound')).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('削除時に予期しないエラーが発生した場合は再スローする', async () => {
      // storeのdeleteメソッドをモックして予期しないエラーをスローさせる
      const unexpectedError = new Error('Unexpected store error');
      jest.spyOn(store, 'delete').mockImplementationOnce(() => {
        throw unexpectedError;
      });

      const input: CreateAlertInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
      };

      const created = await repository.create(input);

      await expect(repository.delete('user-123', created.AlertID)).rejects.toThrow(
        'Unexpected store error'
      );
    });
  });

  describe('create - error handling', () => {
    it('作成時に予期しないエラーが発生した場合は再スローする', async () => {
      // storeのputメソッドをモックして予期しないエラーをスローさせる
      const unexpectedError = new Error('Unexpected store error during create');
      jest.spyOn(store, 'put').mockImplementationOnce(() => {
        throw unexpectedError;
      });

      const input: CreateAlertInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
      };

      await expect(repository.create(input)).rejects.toThrow('Unexpected store error during create');
    });
  });
});
