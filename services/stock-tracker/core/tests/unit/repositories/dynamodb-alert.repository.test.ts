/**
 * Stock Tracker Core - DynamoDB Alert Repository Unit Tests
 *
 * DynamoDBAlertRepositoryのユニットテスト
 */

import { DynamoDBAlertRepository } from '../../../src/repositories/dynamodb-alert.repository.js';
import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  DatabaseError,
  InvalidEntityDataError,
} from '@nagiyu/aws';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { CreateAlertInput } from '../../../src/entities/alert.entity.js';
import { AlertMapper } from '../../../src/mappers/alert.mapper.js';
import { logger } from '@nagiyu/common';

const INVALID_ENTITY_DATA_ERROR_NAME = 'InvalidEntityDataError';

jest.mock('@nagiyu/common', () => ({
  ...jest.requireActual('@nagiyu/common'),
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('DynamoDBAlertRepository', () => {
  let repository: DynamoDBAlertRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  beforeEach(() => {
    // DynamoDBDocumentClient のモック
    mockDocClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<DynamoDBDocumentClient>;

    repository = new DynamoDBAlertRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.clearAllMocks();
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
        subscription: {
          endpoint: 'https://example.com/push',
          keys: {
            p256dh: 'p256dh-key',
            auth: 'auth-secret',
          },
        },
      };

      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.create(input);

      expect(result).toMatchObject(input);
      expect(result.AlertID).toBeDefined();
      expect(result.CreatedAt).toBeDefined();
      expect(result.UpdatedAt).toBeDefined();
      expect(result.CreatedAt).toBe(result.UpdatedAt);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('同じPK/SKのアラートが既に存在する場合はEntityAlreadyExistsErrorをスローする', async () => {
      const input: CreateAlertInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        subscription: {
          endpoint: 'https://example.com/push',
          keys: {
            p256dh: 'p256dh-key',
            auth: 'auth-secret',
          },
        },
      };

      const conditionalCheckError = new Error('Conditional check failed');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(repository.create(input)).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const input: CreateAlertInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        subscription: {
          endpoint: 'https://example.com/push',
          keys: {
            p256dh: 'p256dh-key',
            auth: 'auth-secret',
          },
        },
      };

      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.create(input)).rejects.toThrow(DatabaseError);
    });
  });

  describe('getById', () => {
    it('存在するアラートを取得できる', async () => {
      const mockItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-123',
        Type: 'Alert',
        GSI1PK: 'user-123',
        GSI1SK: 'Alert#alert-123',
        GSI2PK: 'ALERT#MINUTE_LEVEL',
        GSI2SK: 'user-123#alert-123',
        AlertID: 'alert-123',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        subscription: {
          endpoint: 'https://example.com/push',
          keys: {
            p256dh: 'p256dh-key',
            auth: 'auth-secret',
          },
        },
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      mockDocClient.send.mockResolvedValueOnce({ Item: mockItem });

      const result = await repository.getById('user-123', 'alert-123');

      expect(result).toMatchObject({
        AlertID: 'alert-123',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        Mode: 'Buy',
      });
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('存在しないアラートの場合はnullを返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: undefined });

      const result = await repository.getById('user-123', 'alert-notfound');

      expect(result).toBeNull();
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.getById('user-123', 'alert-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getByUserId', () => {
    it('ユーザーのアラート一覧を取得できる', async () => {
      const mockItems = [
        {
          PK: 'USER#user-123',
          SK: 'ALERT#alert-1',
          Type: 'Alert',
          GSI1PK: 'user-123',
          GSI1SK: 'Alert#alert-1',
          GSI2PK: 'ALERT#MINUTE_LEVEL',
          GSI2SK: 'user-123#alert-1',
          AlertID: 'alert-1',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Mode: 'Buy',
          Frequency: 'MINUTE_LEVEL',
          Enabled: true,
          ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
          subscription: {
            endpoint: 'https://example.com/push',
            keys: {
              p256dh: 'p256dh-key',
              auth: 'auth-secret',
            },
          },
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
        {
          PK: 'USER#user-123',
          SK: 'ALERT#alert-2',
          Type: 'Alert',
          GSI1PK: 'user-123',
          GSI1SK: 'Alert#alert-2',
          GSI2PK: 'ALERT#HOURLY_LEVEL',
          GSI2SK: 'user-123#alert-2',
          AlertID: 'alert-2',
          UserID: 'user-123',
          TickerID: 'NSDQ:NVDA',
          ExchangeID: 'NASDAQ',
          Mode: 'Sell',
          Frequency: 'HOURLY_LEVEL',
          Enabled: true,
          ConditionList: [{ field: 'price', operator: 'gte', value: 500.0 }],
          subscription: {
            endpoint: 'https://example.com/push',
            keys: {
              p256dh: 'p256dh-key',
              auth: 'auth-secret',
            },
          },
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockItems,
        Count: 2,
      });

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].UserID).toBe('user-123');
      expect(result.items[1].UserID).toBe('user-123');
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('該当するアラートがない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [],
        Count: 0,
      });

      const result = await repository.getByUserId('user-notfound');

      expect(result.items).toHaveLength(0);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.getByUserId('user-123')).rejects.toThrow(DatabaseError);
    });

    it('論理削除待ち（TTL 設定済み）アラートを除外する FilterExpression が常に付与される', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [], Count: 0 });

      await repository.getByUserId('user-123');

      const sendCall = mockDocClient.send.mock.calls[0][0] as {
        input: {
          FilterExpression?: string;
          ExpressionAttributeNames?: Record<string, string>;
        };
      };
      expect(sendCall.input.FilterExpression).toBe('attribute_not_exists(#ttl)');
      expect(sendCall.input.ExpressionAttributeNames?.['#ttl']).toBe('TTL');
    });

    it('無効なアラートデータをスキップし、有効なデータのみ返す', async () => {
      const validItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-1',
        Type: 'Alert',
        GSI1PK: 'user-123',
        GSI1SK: 'Alert#alert-1',
        GSI2PK: 'ALERT#MINUTE_LEVEL',
        GSI2SK: 'user-123#alert-1',
        AlertID: 'alert-1',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        subscription: {
          endpoint: 'https://example.com/push',
          keys: {
            p256dh: 'p256dh-key',
            auth: 'auth-secret',
          },
        },
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };
      const invalidItem = {
        ...validItem,
        PK: 'USER#user-123',
        SK: 'ALERT#invalid-alert',
        AlertID: 'invalid-alert',
        subscription: undefined,
        SubscriptionEndpoint: undefined,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Items: [validItem, invalidItem],
        Count: 2,
      });

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.AlertID).toBe('alert-1');
      expect(logger.warn).toHaveBeenCalledWith(
        '無効なアラートデータをスキップしました',
        expect.objectContaining({
          pk: 'USER#user-123',
          sk: 'ALERT#invalid-alert',
        })
      );
    });

    it('モジュールインスタンス差異がある環境でも無効データをスキップし、有効なデータのみ返す', async () => {
      const validItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-1',
        Type: 'Alert',
        GSI1PK: 'user-123',
        GSI1SK: 'Alert#alert-1',
        GSI2PK: 'ALERT#MINUTE_LEVEL',
        GSI2SK: 'user-123#alert-1',
        AlertID: 'alert-1',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        subscription: {
          endpoint: 'https://example.com/push',
          keys: {
            p256dh: 'p256dh-key',
            auth: 'auth-secret',
          },
        },
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };
      const invalidItem = {
        ...validItem,
        SK: 'ALERT#invalid-alert',
        AlertID: 'invalid-alert',
      };

      const mapperSpy = jest.spyOn(AlertMapper.prototype, 'toEntity').mockImplementation((item) => {
        const record = item as unknown as { AlertID?: string };
        if (record.AlertID === 'invalid-alert') {
          const baseError = new InvalidEntityDataError(
            'フィールド "SubscriptionEndpoint" が文字列ではありません'
          );
          const duplicatedModuleError = new Error(baseError.message);
          duplicatedModuleError.name = INVALID_ENTITY_DATA_ERROR_NAME;
          throw duplicatedModuleError;
        }

        return {
          ...validItem,
          AlertID: record.AlertID || validItem.AlertID,
        } as unknown as ReturnType<AlertMapper['toEntity']>;
      });

      mockDocClient.send.mockResolvedValueOnce({
        Items: [invalidItem, validItem],
        Count: 2,
      });

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.AlertID).toBe('alert-1');
      expect(logger.warn).toHaveBeenCalledWith(
        '無効なアラートデータをスキップしました',
        expect.objectContaining({
          sk: 'ALERT#invalid-alert',
        })
      );
      mapperSpy.mockRestore();
    });

    it('name が異なるエラーでもメッセージが無効データ形式ならスキップする', async () => {
      const validItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-1',
        Type: 'Alert',
        GSI1PK: 'user-123',
        GSI1SK: 'Alert#alert-1',
        GSI2PK: 'ALERT#MINUTE_LEVEL',
        GSI2SK: 'user-123#alert-1',
        AlertID: 'alert-1',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        subscription: {
          endpoint: 'https://example.com/push',
          keys: {
            p256dh: 'p256dh-key',
            auth: 'auth-secret',
          },
        },
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };
      const invalidItem = {
        ...validItem,
        SK: 'ALERT#invalid-alert',
        AlertID: 'invalid-alert',
      };

      const mapperSpy = jest.spyOn(AlertMapper.prototype, 'toEntity').mockImplementation((item) => {
        const record = item as unknown as { AlertID?: string };
        if (record.AlertID === 'invalid-alert') {
          throw new Error(
            'エンティティデータが無効です: フィールド "SubscriptionEndpoint" が文字列ではありません'
          );
        }

        return {
          ...validItem,
          AlertID: record.AlertID || validItem.AlertID,
        } as unknown as ReturnType<AlertMapper['toEntity']>;
      });

      mockDocClient.send.mockResolvedValueOnce({
        Items: [invalidItem, validItem],
        Count: 2,
      });

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.AlertID).toBe('alert-1');
      expect(logger.warn).toHaveBeenCalledWith(
        '無効なアラートデータをスキップしました',
        expect.objectContaining({
          sk: 'ALERT#invalid-alert',
        })
      );
      mapperSpy.mockRestore();
    });
  });

  describe('getByFrequency', () => {
    it('頻度ごとのアラート一覧を取得できる', async () => {
      const mockItems = [
        {
          PK: 'USER#user-123',
          SK: 'ALERT#alert-1',
          Type: 'Alert',
          GSI1PK: 'user-123',
          GSI1SK: 'Alert#alert-1',
          GSI2PK: 'ALERT#MINUTE_LEVEL',
          GSI2SK: 'user-123#alert-1',
          AlertID: 'alert-1',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Mode: 'Buy',
          Frequency: 'MINUTE_LEVEL',
          Enabled: true,
          ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
          subscription: {
            endpoint: 'https://example.com/push',
            keys: {
              p256dh: 'p256dh-key',
              auth: 'auth-secret',
            },
          },
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockItems,
        Count: 1,
      });

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].Frequency).toBe('MINUTE_LEVEL');
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('該当するアラートがない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [],
        Count: 0,
      });

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result.items).toHaveLength(0);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.getByFrequency('MINUTE_LEVEL')).rejects.toThrow(DatabaseError);
    });

    it('無効なアラートデータをスキップし、有効なデータのみ返す', async () => {
      const validItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-1',
        Type: 'Alert',
        GSI1PK: 'user-123',
        GSI1SK: 'Alert#alert-1',
        GSI2PK: 'ALERT#MINUTE_LEVEL',
        GSI2SK: 'user-123#alert-1',
        AlertID: 'alert-1',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        subscription: {
          endpoint: 'https://example.com/push',
          keys: {
            p256dh: 'p256dh-key',
            auth: 'auth-secret',
          },
        },
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };
      const invalidItem = {
        ...validItem,
        PK: 'USER#user-123',
        SK: 'ALERT#invalid-alert',
        AlertID: 'invalid-alert',
        subscription: undefined,
        SubscriptionEndpoint: undefined,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Items: [invalidItem, validItem],
        Count: 2,
      });

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.AlertID).toBe('alert-1');
      expect(logger.warn).toHaveBeenCalledWith(
        '無効なアラートデータをスキップしました',
        expect.objectContaining({
          pk: 'USER#user-123',
          sk: 'ALERT#invalid-alert',
        })
      );
    });

    it('toEntity から InvalidEntityDataError 以外のエラーが投げられても、バッチ全体を壊さずにスキップする', async () => {
      const validItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-1',
        AlertID: 'alert-1',
        UserID: 'user-123',
      };
      const invalidItem = {
        ...validItem,
        SK: 'ALERT#invalid-alert',
        AlertID: 'invalid-alert',
      };

      const mapperSpy = jest.spyOn(AlertMapper.prototype, 'toEntity').mockImplementation((item) => {
        const record = item as unknown as { AlertID?: string };
        if (record.AlertID === 'invalid-alert') {
          // モジュールインスタンス差異など想定外の経路で `InvalidEntityDataError` 判定が
          // すり抜けたケースをシミュレート: 名前/メッセージともに合致しない TypeError
          throw new TypeError('Cannot read properties of undefined');
        }

        return {
          AlertID: record.AlertID,
          UserID: 'user-123',
        } as unknown as ReturnType<AlertMapper['toEntity']>;
      });

      mockDocClient.send.mockResolvedValueOnce({
        Items: [invalidItem, validItem],
        Count: 2,
      });

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.AlertID).toBe('alert-1');
      expect(logger.warn).toHaveBeenCalledWith(
        '無効なアラートデータをスキップしました',
        expect.objectContaining({
          sk: 'ALERT#invalid-alert',
          error: 'Cannot read properties of undefined',
        })
      );
      mapperSpy.mockRestore();
    });

    it('toEntity が DatabaseError でラップされたエラーを投げても、バッチを壊さずにスキップする', async () => {
      // 本番再現: 何らかの理由で toEntity から DatabaseError 形式のエラーが投げられても
      // 外側 catch で再ラップされて totalAlerts: 0 でクラッシュすることがあってはならない
      const validItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-1',
        AlertID: 'alert-1',
        UserID: 'user-123',
      };
      const invalidItem = {
        ...validItem,
        SK: 'ALERT#invalid-alert',
        AlertID: 'invalid-alert',
      };

      const mapperSpy = jest.spyOn(AlertMapper.prototype, 'toEntity').mockImplementation((item) => {
        const record = item as unknown as { AlertID?: string };
        if (record.AlertID === 'invalid-alert') {
          // すでに DatabaseError 形式に再ラップされたメッセージを持つエラーを擬似的に投げる
          const wrapped = new Error(
            'データベースエラーが発生しました: エンティティデータが無効です: フィールド "SubscriptionEndpoint" が文字列ではありません'
          );
          wrapped.name = 'DatabaseError';
          throw wrapped;
        }

        return {
          AlertID: record.AlertID,
          UserID: 'user-123',
        } as unknown as ReturnType<AlertMapper['toEntity']>;
      });

      mockDocClient.send.mockResolvedValueOnce({
        Items: [invalidItem, validItem],
        Count: 2,
      });

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.AlertID).toBe('alert-1');
      expect(logger.warn).toHaveBeenCalledWith(
        '無効なアラートデータをスキップしました',
        expect.objectContaining({ sk: 'ALERT#invalid-alert' })
      );
      mapperSpy.mockRestore();
    });
  });

  describe('update', () => {
    it('アラートを更新できる', async () => {
      const mockUpdatedItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-123',
        Type: 'Alert',
        GSI1PK: 'user-123',
        GSI1SK: 'Alert#alert-123',
        GSI2PK: 'ALERT#MINUTE_LEVEL',
        GSI2SK: 'user-123#alert-123',
        AlertID: 'alert-123',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: false,
        ConditionList: [{ field: 'price', operator: 'lte', value: 140.0 }],
        subscription: {
          endpoint: 'https://example.com/push',
          keys: {
            p256dh: 'p256dh-key',
            auth: 'auth-secret',
          },
        },
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067300000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Attributes: mockUpdatedItem,
      });

      const result = await repository.update('user-123', 'alert-123', {
        Enabled: false,
        ConditionList: [{ field: 'price', operator: 'lte', value: 140.0 }],
      });

      expect(result.Enabled).toBe(false);
      expect(result.ConditionList[0].value).toBe(140.0);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('通知タイトルと通知本文を更新式に含めて更新できる', async () => {
      const mockUpdatedItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-123',
        Type: 'Alert',
        GSI1PK: 'user-123',
        GSI1SK: 'Alert#alert-123',
        GSI2PK: 'ALERT#MINUTE_LEVEL',
        GSI2SK: 'user-123#alert-123',
        AlertID: 'alert-123',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 140.0 }],
        NotificationTitle: '更新後タイトル',
        NotificationBody: '更新後本文',
        subscription: {
          endpoint: 'https://example.com/push',
          keys: {
            p256dh: 'p256dh-key',
            auth: 'auth-secret',
          },
        },
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067300000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Attributes: mockUpdatedItem,
      });

      await repository.update('user-123', 'alert-123', {
        NotificationTitle: '更新後タイトル',
        NotificationBody: '更新後本文',
      });

      const command = mockDocClient.send.mock.calls[0]?.[0] as {
        input: {
          UpdateExpression: string;
          ExpressionAttributeNames: Record<string, string>;
          ExpressionAttributeValues: Record<string, unknown>;
        };
      };

      expect(command.input.UpdateExpression).toContain('#notificationTitle = :notificationTitle');
      expect(command.input.UpdateExpression).toContain('#notificationBody = :notificationBody');
      expect(command.input.ExpressionAttributeNames['#notificationTitle']).toBe(
        'NotificationTitle'
      );
      expect(command.input.ExpressionAttributeNames['#notificationBody']).toBe('NotificationBody');
      expect(command.input.ExpressionAttributeValues[':notificationTitle']).toBe('更新後タイトル');
      expect(command.input.ExpressionAttributeValues[':notificationBody']).toBe('更新後本文');
    });

    it('存在しないアラートを更新しようとするとEntityNotFoundErrorをスローする', async () => {
      const conditionalCheckError = new Error('Conditional check failed');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(
        repository.update('user-123', 'alert-notfound', { Enabled: false })
      ).rejects.toThrow(EntityNotFoundError);
    });

    it('更新するフィールドがない場合はDatabaseErrorをスローする', async () => {
      await expect(repository.update('user-123', 'alert-123', {})).rejects.toThrow(DatabaseError);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.update('user-123', 'alert-123', { Enabled: false })).rejects.toThrow(
        DatabaseError
      );
    });

    it('複数のフィールドを同時に更新できる', async () => {
      const mockUpdatedItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-123',
        Type: 'Alert',
        GSI1PK: 'user-123',
        GSI1SK: 'Alert#alert-123',
        GSI2PK: 'ALERT#HOURLY_LEVEL',
        GSI2SK: 'user-123#alert-123',
        AlertID: 'alert-123',
        UserID: 'user-123',
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 500.0 }],
        subscription: {
          endpoint: 'https://new.example.com/push',
          keys: {
            p256dh: 'new-p256dh-key',
            auth: 'new-auth-secret',
          },
        },
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067400000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Attributes: mockUpdatedItem,
      });

      const result = await repository.update('user-123', 'alert-123', {
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        subscription: {
          endpoint: 'https://new.example.com/push',
          keys: {
            p256dh: 'new-p256dh-key',
            auth: 'new-auth-secret',
          },
        },
      });

      expect(result.TickerID).toBe('NSDQ:NVDA');
      expect(result.Mode).toBe('Sell');
      expect(result.Frequency).toBe('HOURLY_LEVEL');
      expect(result.subscription.endpoint).toBe('https://new.example.com/push');
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('Attributesが存在しない場合はEntityNotFoundErrorをスローする', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: undefined,
      });

      await expect(repository.update('user-123', 'alert-123', { Enabled: false })).rejects.toThrow(
        EntityNotFoundError
      );
    });
  });

  describe('delete', () => {
    it('アラートを削除できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await repository.delete('user-123', 'alert-123');

      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('存在しないアラートを削除しようとするとEntityNotFoundErrorをスローする', async () => {
      const conditionalCheckError = new Error('Conditional check failed');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(repository.delete('user-123', 'alert-notfound')).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.delete('user-123', 'alert-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getTemporaryCandidatesByFrequency', () => {
    it('Temporary かつ Enabled な候補を軽量エンティティで返す', async () => {
      const mockItems = [
        {
          PK: 'USER#user-1',
          SK: 'ALERT#alert-1',
          AlertID: 'alert-1',
          UserID: 'user-1',
          ExchangeID: 'NASDAQ',
          Frequency: 'MINUTE_LEVEL',
          Enabled: true,
          Temporary: true,
          TemporaryExpireDate: '2026-03-04',
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({ Items: mockItems, Count: 1 });

      const result = await repository.getTemporaryCandidatesByFrequency('MINUTE_LEVEL');

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        AlertID: 'alert-1',
        UserID: 'user-1',
        ExchangeID: 'NASDAQ',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        Temporary: true,
        TemporaryExpireDate: '2026-03-04',
      });
    });

    it('Query には Temporary=true AND TTL 未設定 の FilterExpression と ProjectionExpression が指定される', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [], Count: 0 });

      await repository.getTemporaryCandidatesByFrequency('HOURLY_LEVEL');

      const sendCall = mockDocClient.send.mock.calls[0][0] as {
        input: {
          FilterExpression?: string;
          ProjectionExpression?: string;
          ExpressionAttributeNames?: Record<string, string>;
          ExpressionAttributeValues?: Record<string, unknown>;
        };
      };
      expect(sendCall.input.FilterExpression).toBe(
        '#temporary = :true AND attribute_not_exists(#ttl)'
      );
      expect(sendCall.input.ExpressionAttributeNames?.['#ttl']).toBe('TTL');
      expect(sendCall.input.ProjectionExpression).toContain('#alertId');
      // subscription 関連の属性は ProjectionExpression に含めない
      expect(sendCall.input.ProjectionExpression).not.toContain('subscription');
      expect(sendCall.input.ExpressionAttributeValues?.[':true']).toBe(true);
    });

    it('subscription を含む不正データでも例外を投げず、必要属性さえ揃っていれば返す', async () => {
      const mockItems = [
        {
          PK: 'USER#user-1',
          SK: 'ALERT#alert-1',
          AlertID: 'alert-1',
          UserID: 'user-1',
          ExchangeID: 'NASDAQ',
          Frequency: 'MINUTE_LEVEL',
          Enabled: true,
          Temporary: true,
          TemporaryExpireDate: '2026-03-04',
          // subscription が無効でも軽量取得経路では参照しない
          subscription: undefined,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({ Items: mockItems, Count: 1 });

      const result = await repository.getTemporaryCandidatesByFrequency('MINUTE_LEVEL');

      expect(result.items).toHaveLength(1);
    });

    it('必須属性が欠損したアイテムはスキップして警告ログを出す', async () => {
      const mockItems = [
        {
          PK: 'USER#user-1',
          SK: 'ALERT#alert-broken',
          // AlertID が欠損
          UserID: 'user-1',
          ExchangeID: 'NASDAQ',
          Frequency: 'MINUTE_LEVEL',
          Enabled: true,
          Temporary: true,
          TemporaryExpireDate: '2026-03-04',
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({ Items: mockItems, Count: 1 });

      const result = await repository.getTemporaryCandidatesByFrequency('MINUTE_LEVEL');

      expect(result.items).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        '無効な一時アラート候補をスキップしました',
        expect.objectContaining({ pk: 'USER#user-1', sk: 'ALERT#alert-broken' })
      );
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('DB down'));

      await expect(repository.getTemporaryCandidatesByFrequency('MINUTE_LEVEL')).rejects.toThrow(
        DatabaseError
      );
    });
  });

  describe('markTemporaryAsExpired', () => {
    it('Enabled=false, TTL, UpdatedAt を SET する UpdateItem を送信する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await repository.markTemporaryAsExpired('user-1', 'alert-1', 1234567890);

      const sendCall = mockDocClient.send.mock.calls[0][0] as {
        input: {
          UpdateExpression?: string;
          ExpressionAttributeNames?: Record<string, string>;
          ExpressionAttributeValues?: Record<string, unknown>;
          ConditionExpression?: string;
          Key?: Record<string, unknown>;
        };
      };
      expect(sendCall.input.UpdateExpression).toBe(
        'SET #enabled = :enabled, #ttl = :ttl, #updatedAt = :updatedAt'
      );
      expect(sendCall.input.ExpressionAttributeNames?.['#ttl']).toBe('TTL');
      expect(sendCall.input.ExpressionAttributeValues?.[':enabled']).toBe(false);
      expect(sendCall.input.ExpressionAttributeValues?.[':ttl']).toBe(1234567890);
      expect(sendCall.input.ConditionExpression).toBe('attribute_exists(PK)');
      expect(sendCall.input.Key).toEqual({ PK: 'USER#user-1', SK: 'ALERT#alert-1' });
    });

    it('対象アラートが存在しない場合は EntityNotFoundError', async () => {
      const conditionalCheckError = new Error('Conditional check failed');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(repository.markTemporaryAsExpired('user-1', 'alert-missing', 1)).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('その他のエラーは DatabaseError にラップされる', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));

      await expect(repository.markTemporaryAsExpired('user-1', 'alert-1', 1)).rejects.toThrow(
        DatabaseError
      );
    });
  });
});
