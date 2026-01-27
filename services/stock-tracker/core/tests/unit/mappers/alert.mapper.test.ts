/**
 * Stock Tracker Core - Alert Mapper Unit Tests
 *
 * AlertMapperのユニットテスト
 */

import { AlertMapper } from '../../../src/mappers/alert.mapper.js';
import type { AlertEntity } from '../../../src/entities/alert.entity.js';
import type { DynamoDBItem } from '@nagiyu/aws';

describe('AlertMapper', () => {
  let mapper: AlertMapper;

  beforeEach(() => {
    mapper = new AlertMapper();
  });

  describe('toItem', () => {
    it('AlertEntity を DynamoDBItem に正しく変換する', () => {
      const entity: AlertEntity = {
        AlertID: 'alert-123',
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
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const item = mapper.toItem(entity);

      expect(item).toEqual({
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
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });
    });

    it('異なるユーザーIDで異なるPKを生成する', () => {
      const entity1: AlertEntity = {
        AlertID: 'alert-123',
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
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const entity2: AlertEntity = {
        ...entity1,
        UserID: 'user-456',
      };

      const item1 = mapper.toItem(entity1);
      const item2 = mapper.toItem(entity2);

      expect(item1.PK).toBe('USER#user-123');
      expect(item2.PK).toBe('USER#user-456');
      expect(item1.PK).not.toBe(item2.PK);
    });

    it('異なるアラートIDで異なるSKを生成する', () => {
      const entity1: AlertEntity = {
        AlertID: 'alert-123',
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
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const entity2: AlertEntity = {
        ...entity1,
        AlertID: 'alert-456',
      };

      const item1 = mapper.toItem(entity1);
      const item2 = mapper.toItem(entity2);

      expect(item1.SK).toBe('ALERT#alert-123');
      expect(item2.SK).toBe('ALERT#alert-456');
      expect(item1.SK).not.toBe(item2.SK);
    });

    it('異なる頻度で異なるGSI2PKを生成する', () => {
      const entity1: AlertEntity = {
        AlertID: 'alert-123',
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
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const entity2: AlertEntity = {
        ...entity1,
        Frequency: 'HOURLY_LEVEL',
      };

      const item1 = mapper.toItem(entity1);
      const item2 = mapper.toItem(entity2);

      expect(item1.GSI2PK).toBe('ALERT#MINUTE_LEVEL');
      expect(item2.GSI2PK).toBe('ALERT#HOURLY_LEVEL');
      expect(item1.GSI2PK).not.toBe(item2.GSI2PK);
    });
  });

  describe('toEntity', () => {
    it('DynamoDBItem を AlertEntity に正しく変換する', () => {
      const item: DynamoDBItem = {
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
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const entity = mapper.toEntity(item);

      expect(entity).toEqual({
        AlertID: 'alert-123',
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
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });
    });

    it('DynamoDBItem の PK/SK を含まないエンティティを返す', () => {
      const item: DynamoDBItem = {
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
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const entity = mapper.toEntity(item);

      expect(entity).not.toHaveProperty('PK');
      expect(entity).not.toHaveProperty('SK');
      expect(entity).not.toHaveProperty('Type');
      expect(entity).not.toHaveProperty('GSI1PK');
      expect(entity).not.toHaveProperty('GSI1SK');
      expect(entity).not.toHaveProperty('GSI2PK');
      expect(entity).not.toHaveProperty('GSI2SK');
    });

    it('必須フィールドが欠けている場合はエラーをスローする', () => {
      const item: DynamoDBItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-123',
        Type: 'Alert',
        // AlertID が欠けている
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
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      expect(() => mapper.toEntity(item)).toThrow();
    });

    it('ConditionListが空配列の場合はエラーをスローする', () => {
      const item: DynamoDBItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-123',
        Type: 'Alert',
        AlertID: 'alert-123',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [], // 空配列
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      expect(() => mapper.toEntity(item)).toThrow('ConditionList');
    });
  });

  describe('buildKeys', () => {
    it('userId と alertId から PK/SK を正しく構築する', () => {
      const keys = mapper.buildKeys({ userId: 'user-123', alertId: 'alert-456' });

      expect(keys).toEqual({
        pk: 'USER#user-123',
        sk: 'ALERT#alert-456',
      });
    });

    it('異なる userId で異なる PK を生成する', () => {
      const keys1 = mapper.buildKeys({ userId: 'user-123', alertId: 'alert-456' });
      const keys2 = mapper.buildKeys({ userId: 'user-789', alertId: 'alert-456' });

      expect(keys1.pk).not.toBe(keys2.pk);
      expect(keys1.sk).toBe(keys2.sk);
    });

    it('異なる alertId で異なる SK を生成する', () => {
      const keys1 = mapper.buildKeys({ userId: 'user-123', alertId: 'alert-456' });
      const keys2 = mapper.buildKeys({ userId: 'user-123', alertId: 'alert-789' });

      expect(keys1.pk).toBe(keys2.pk);
      expect(keys1.sk).not.toBe(keys2.sk);
    });
  });

  describe('変換の往復', () => {
    it('Entity -> Item -> Entity の変換で元のエンティティに戻る', () => {
      const original: AlertEntity = {
        AlertID: 'alert-123',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        Enabled: false,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const item = mapper.toItem(original);
      const result = mapper.toEntity(item);

      expect(result).toEqual(original);
    });
  });
});
