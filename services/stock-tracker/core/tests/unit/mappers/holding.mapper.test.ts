/**
 * Stock Tracker Core - Holding Mapper Unit Tests
 *
 * HoldingMapperのユニットテスト
 */

import { HoldingMapper } from '../../../src/mappers/holding.mapper.js';
import type { HoldingEntity } from '../../../src/entities/holding.entity.js';
import type { DynamoDBItem } from '@nagiyu/aws';

describe('HoldingMapper', () => {
  let mapper: HoldingMapper;

  beforeEach(() => {
    mapper = new HoldingMapper();
  });

  describe('toItem', () => {
    it('HoldingEntity を DynamoDBItem に正しく変換する', () => {
      const entity: HoldingEntity = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10.5,
        AveragePrice: 150.25,
        Currency: 'USD',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const item = mapper.toItem(entity);

      expect(item).toEqual({
        PK: 'USER#user-123',
        SK: 'HOLDING#NSDQ:AAPL',
        Type: 'Holding',
        GSI1PK: 'user-123',
        GSI1SK: 'Holding#NSDQ:AAPL',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10.5,
        AveragePrice: 150.25,
        Currency: 'USD',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });
    });

    it('異なるユーザーIDで異なるPKを生成する', () => {
      const entity1: HoldingEntity = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10,
        AveragePrice: 150,
        Currency: 'USD',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const entity2: HoldingEntity = {
        ...entity1,
        UserID: 'user-456',
      };

      const item1 = mapper.toItem(entity1);
      const item2 = mapper.toItem(entity2);

      expect(item1.PK).toBe('USER#user-123');
      expect(item2.PK).toBe('USER#user-456');
      expect(item1.PK).not.toBe(item2.PK);
    });

    it('異なるティッカーIDで異なるSKを生成する', () => {
      const entity1: HoldingEntity = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10,
        AveragePrice: 150,
        Currency: 'USD',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const entity2: HoldingEntity = {
        ...entity1,
        TickerID: 'NSDQ:NVDA',
      };

      const item1 = mapper.toItem(entity1);
      const item2 = mapper.toItem(entity2);

      expect(item1.SK).toBe('HOLDING#NSDQ:AAPL');
      expect(item2.SK).toBe('HOLDING#NSDQ:NVDA');
      expect(item1.SK).not.toBe(item2.SK);
    });
  });

  describe('toEntity', () => {
    it('DynamoDBItem を HoldingEntity に正しく変換する', () => {
      const item: DynamoDBItem = {
        PK: 'USER#user-123',
        SK: 'HOLDING#NSDQ:AAPL',
        Type: 'Holding',
        GSI1PK: 'user-123',
        GSI1SK: 'Holding#NSDQ:AAPL',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10.5,
        AveragePrice: 150.25,
        Currency: 'USD',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const entity = mapper.toEntity(item);

      expect(entity).toEqual({
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10.5,
        AveragePrice: 150.25,
        Currency: 'USD',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });
    });

    it('DynamoDBItem にビジネスフィールドのみを含む（PK/SKを含まない）', () => {
      const item: DynamoDBItem = {
        PK: 'USER#user-123',
        SK: 'HOLDING#NSDQ:AAPL',
        Type: 'Holding',
        GSI1PK: 'user-123',
        GSI1SK: 'Holding#NSDQ:AAPL',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10,
        AveragePrice: 150,
        Currency: 'USD',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const entity = mapper.toEntity(item);

      // エンティティにはPK/SKが含まれていないことを確認
      expect('PK' in entity).toBe(false);
      expect('SK' in entity).toBe(false);
      expect('Type' in entity).toBe(false);
      expect('GSI1PK' in entity).toBe(false);
      expect('GSI1SK' in entity).toBe(false);
    });

    it('必須フィールドが不足している場合にエラーをスローする', () => {
      const invalidItem = {
        PK: 'USER#user-123',
        SK: 'HOLDING#NSDQ:AAPL',
        Type: 'Holding',
        // UserID が不足
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10,
        AveragePrice: 150,
        Currency: 'USD',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      } as DynamoDBItem;

      expect(() => mapper.toEntity(invalidItem)).toThrow();
    });
  });

  describe('buildKeys', () => {
    it('ビジネスキーから正しくPK/SKを構築する', () => {
      const keys = mapper.buildKeys({ userId: 'user-123', tickerId: 'NSDQ:AAPL' });

      expect(keys).toEqual({
        pk: 'USER#user-123',
        sk: 'HOLDING#NSDQ:AAPL',
      });
    });

    it('異なるユーザーIDで異なるPKを生成する', () => {
      const keys1 = mapper.buildKeys({ userId: 'user-123', tickerId: 'NSDQ:AAPL' });
      const keys2 = mapper.buildKeys({ userId: 'user-456', tickerId: 'NSDQ:AAPL' });

      expect(keys1.pk).toBe('USER#user-123');
      expect(keys2.pk).toBe('USER#user-456');
      expect(keys1.pk).not.toBe(keys2.pk);
    });

    it('異なるティッカーIDで異なるSKを生成する', () => {
      const keys1 = mapper.buildKeys({ userId: 'user-123', tickerId: 'NSDQ:AAPL' });
      const keys2 = mapper.buildKeys({ userId: 'user-123', tickerId: 'NSDQ:NVDA' });

      expect(keys1.sk).toBe('HOLDING#NSDQ:AAPL');
      expect(keys2.sk).toBe('HOLDING#NSDQ:NVDA');
      expect(keys1.sk).not.toBe(keys2.sk);
    });
  });

  describe('toItem と toEntity のラウンドトリップ', () => {
    it('Entity → Item → Entity の変換で元のデータが保持される', () => {
      const originalEntity: HoldingEntity = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10.5,
        AveragePrice: 150.25,
        Currency: 'USD',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const item = mapper.toItem(originalEntity);
      const convertedEntity = mapper.toEntity(item);

      expect(convertedEntity).toEqual(originalEntity);
    });
  });
});
