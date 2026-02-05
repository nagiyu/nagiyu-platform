/**
 * Stock Tracker Core - Watchlist Mapper Unit Tests
 *
 * WatchlistMapperのユニットテスト
 */

import { WatchlistMapper } from '../../../src/mappers/watchlist.mapper.js';
import type { WatchlistEntity } from '../../../src/entities/watchlist.entity.js';
import type { DynamoDBItem } from '@nagiyu/aws';

describe('WatchlistMapper', () => {
  let mapper: WatchlistMapper;

  beforeEach(() => {
    mapper = new WatchlistMapper();
  });

  describe('toItem', () => {
    it('WatchlistEntity を DynamoDBItem に正しく変換する', () => {
      const entity: WatchlistEntity = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
      };

      const item = mapper.toItem(entity);

      expect(item).toEqual({
        PK: 'USER#user-123',
        SK: 'WATCHLIST#NSDQ:AAPL',
        Type: 'Watchlist',
        GSI1PK: 'user-123',
        GSI1SK: 'Watchlist#NSDQ:AAPL',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000, // Watchlist は読み取り専用のため CreatedAt と同じ
      });
    });

    it('異なるユーザーIDで異なるPKを生成する', () => {
      const entity1: WatchlistEntity = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
      };

      const entity2: WatchlistEntity = {
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
      const entity1: WatchlistEntity = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
      };

      const entity2: WatchlistEntity = {
        ...entity1,
        TickerID: 'NSDQ:NVDA',
      };

      const item1 = mapper.toItem(entity1);
      const item2 = mapper.toItem(entity2);

      expect(item1.SK).toBe('WATCHLIST#NSDQ:AAPL');
      expect(item2.SK).toBe('WATCHLIST#NSDQ:NVDA');
      expect(item1.SK).not.toBe(item2.SK);
    });

    it('UpdatedAt フィールドが CreatedAt と同じ値になる（Watchlistは読み取り専用）', () => {
      const entity: WatchlistEntity = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
      };

      const item = mapper.toItem(entity);

      expect(item.UpdatedAt).toBe(item.CreatedAt);
      expect(item.UpdatedAt).toBe(1704067200000);
    });
  });

  describe('toEntity', () => {
    it('DynamoDBItem を WatchlistEntity に正しく変換する', () => {
      const item: DynamoDBItem = {
        PK: 'USER#user-123',
        SK: 'WATCHLIST#NSDQ:AAPL',
        Type: 'Watchlist',
        GSI1PK: 'user-123',
        GSI1SK: 'Watchlist#NSDQ:AAPL',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const entity = mapper.toEntity(item);

      expect(entity).toEqual({
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
      });
    });

    it('DynamoDBItem にビジネスフィールドのみを含む（PK/SKを含まない）', () => {
      const item: DynamoDBItem = {
        PK: 'USER#user-123',
        SK: 'WATCHLIST#NSDQ:AAPL',
        Type: 'Watchlist',
        GSI1PK: 'user-123',
        GSI1SK: 'Watchlist#NSDQ:AAPL',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
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

    it('必須フィールドが不足している場合にエラーをスローする - UserID', () => {
      const invalidItem = {
        PK: 'USER#user-123',
        SK: 'WATCHLIST#NSDQ:AAPL',
        Type: 'Watchlist',
        // UserID が不足
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
      } as DynamoDBItem;

      expect(() => mapper.toEntity(invalidItem)).toThrow();
    });

    it('必須フィールドが不足している場合にエラーをスローする - TickerID', () => {
      const invalidItem = {
        PK: 'USER#user-123',
        SK: 'WATCHLIST#NSDQ:AAPL',
        Type: 'Watchlist',
        UserID: 'user-123',
        // TickerID が不足
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
      } as DynamoDBItem;

      expect(() => mapper.toEntity(invalidItem)).toThrow();
    });

    it('必須フィールドが不足している場合にエラーをスローする - ExchangeID', () => {
      const invalidItem = {
        PK: 'USER#user-123',
        SK: 'WATCHLIST#NSDQ:AAPL',
        Type: 'Watchlist',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        // ExchangeID が不足
        CreatedAt: 1704067200000,
      } as DynamoDBItem;

      expect(() => mapper.toEntity(invalidItem)).toThrow();
    });

    it('必須フィールドが不足している場合にエラーをスローする - CreatedAt', () => {
      const invalidItem = {
        PK: 'USER#user-123',
        SK: 'WATCHLIST#NSDQ:AAPL',
        Type: 'Watchlist',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        // CreatedAt が不足
      } as DynamoDBItem;

      expect(() => mapper.toEntity(invalidItem)).toThrow();
    });
  });

  describe('buildKeys', () => {
    it('ビジネスキーから正しくPK/SKを構築する', () => {
      const keys = mapper.buildKeys({ userId: 'user-123', tickerId: 'NSDQ:AAPL' });

      expect(keys).toEqual({
        pk: 'USER#user-123',
        sk: 'WATCHLIST#NSDQ:AAPL',
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

      expect(keys1.sk).toBe('WATCHLIST#NSDQ:AAPL');
      expect(keys2.sk).toBe('WATCHLIST#NSDQ:NVDA');
      expect(keys1.sk).not.toBe(keys2.sk);
    });
  });

  describe('toItem と toEntity のラウンドトリップ', () => {
    it('Entity → Item → Entity の変換で元のデータが保持される', () => {
      const originalEntity: WatchlistEntity = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
      };

      const item = mapper.toItem(originalEntity);
      const convertedEntity = mapper.toEntity(item);

      expect(convertedEntity).toEqual(originalEntity);
    });
  });
});
