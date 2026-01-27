/**
 * Stock Tracker Core - Ticker Mapper Unit Tests
 *
 * TickerMapperのユニットテスト
 */

import { TickerMapper } from '../../../src/mappers/ticker.mapper.js';
import type { TickerEntity } from '../../../src/entities/ticker.entity.js';
import type { DynamoDBItem } from '@nagiyu/aws';

describe('TickerMapper', () => {
  let mapper: TickerMapper;

  beforeEach(() => {
    mapper = new TickerMapper();
  });

  describe('toItem', () => {
    it('TickerEntity を DynamoDBItem に正しく変換する', () => {
      const entity: TickerEntity = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const item = mapper.toItem(entity);

      expect(item).toEqual({
        PK: 'TICKER#NSDQ:AAPL',
        SK: 'METADATA',
        Type: 'Ticker',
        GSI3PK: 'NASDAQ',
        GSI3SK: 'TICKER#NSDQ:AAPL',
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });
    });

    it('異なるティッカーIDで異なるPKを生成する', () => {
      const entity1: TickerEntity = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const entity2: TickerEntity = {
        ...entity1,
        TickerID: 'NSDQ:NVDA',
        Symbol: 'NVDA',
        Name: 'NVIDIA Corporation',
      };

      const item1 = mapper.toItem(entity1);
      const item2 = mapper.toItem(entity2);

      expect(item1.PK).toBe('TICKER#NSDQ:AAPL');
      expect(item2.PK).toBe('TICKER#NSDQ:NVDA');
      expect(item1.PK).not.toBe(item2.PK);
    });

    it('異なる取引所IDで異なるGSI3PKを生成する', () => {
      const entity1: TickerEntity = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const entity2: TickerEntity = {
        TickerID: 'NYSE:IBM',
        Symbol: 'IBM',
        Name: 'IBM',
        ExchangeID: 'NYSE',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const item1 = mapper.toItem(entity1);
      const item2 = mapper.toItem(entity2);

      expect(item1.GSI3PK).toBe('NASDAQ');
      expect(item2.GSI3PK).toBe('NYSE');
      expect(item1.GSI3PK).not.toBe(item2.GSI3PK);
    });
  });

  describe('toEntity', () => {
    it('DynamoDBItem を TickerEntity に正しく変換する', () => {
      const item: DynamoDBItem = {
        PK: 'TICKER#NSDQ:AAPL',
        SK: 'METADATA',
        Type: 'Ticker',
        GSI3PK: 'NASDAQ',
        GSI3SK: 'TICKER#NSDQ:AAPL',
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const entity = mapper.toEntity(item);

      expect(entity).toEqual({
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });
    });

    it('DynamoDBItem の PK/SK を含まないエンティティを返す', () => {
      const item: DynamoDBItem = {
        PK: 'TICKER#NSDQ:AAPL',
        SK: 'METADATA',
        Type: 'Ticker',
        GSI3PK: 'NASDAQ',
        GSI3SK: 'TICKER#NSDQ:AAPL',
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const entity = mapper.toEntity(item);

      expect(entity).not.toHaveProperty('PK');
      expect(entity).not.toHaveProperty('SK');
      expect(entity).not.toHaveProperty('Type');
      expect(entity).not.toHaveProperty('GSI3PK');
      expect(entity).not.toHaveProperty('GSI3SK');
    });

    it('必須フィールドが欠けている場合はエラーをスローする', () => {
      const item: DynamoDBItem = {
        PK: 'TICKER#NSDQ:AAPL',
        SK: 'METADATA',
        Type: 'Ticker',
        // TickerID が欠けている
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      expect(() => mapper.toEntity(item)).toThrow();
    });
  });

  describe('buildKeys', () => {
    it('tickerId から PK/SK を正しく構築する', () => {
      const keys = mapper.buildKeys({ tickerId: 'NSDQ:AAPL' });

      expect(keys).toEqual({
        pk: 'TICKER#NSDQ:AAPL',
        sk: 'METADATA',
      });
    });

    it('異なる tickerId で異なるキーを生成する', () => {
      const keys1 = mapper.buildKeys({ tickerId: 'NSDQ:AAPL' });
      const keys2 = mapper.buildKeys({ tickerId: 'NSDQ:NVDA' });

      expect(keys1.pk).not.toBe(keys2.pk);
      expect(keys1.sk).toBe(keys2.sk); // SKは常に METADATA
    });
  });

  describe('変換の往復', () => {
    it('Entity -> Item -> Entity の変換で元のエンティティに戻る', () => {
      const original: TickerEntity = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const item = mapper.toItem(original);
      const result = mapper.toEntity(item);

      expect(result).toEqual(original);
    });
  });
});
