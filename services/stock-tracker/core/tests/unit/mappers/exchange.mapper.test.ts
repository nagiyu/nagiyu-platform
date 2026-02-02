/**
 * Stock Tracker Core - Exchange Mapper Unit Tests
 *
 * ExchangeMapperのユニットテスト
 */

import { ExchangeMapper } from '../../../src/mappers/exchange.mapper.js';
import type { ExchangeEntity } from '../../../src/entities/exchange.entity.js';
import type { DynamoDBItem } from '@nagiyu/aws';

describe('ExchangeMapper', () => {
  let mapper: ExchangeMapper;

  beforeEach(() => {
    mapper = new ExchangeMapper();
  });

  describe('toItem', () => {
    it('ExchangeEntity を DynamoDBItem に正しく変換する', () => {
      const entity: ExchangeEntity = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const item = mapper.toItem(entity);

      expect(item).toEqual({
        PK: 'EXCHANGE#NASDAQ',
        SK: 'METADATA',
        Type: 'Exchange',
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });
    });

    it('異なる取引所IDで異なるPKを生成する', () => {
      const entity1: ExchangeEntity = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const entity2: ExchangeEntity = {
        ...entity1,
        ExchangeID: 'NYSE',
        Name: 'New York Stock Exchange',
        Key: 'NYSE',
      };

      const item1 = mapper.toItem(entity1);
      const item2 = mapper.toItem(entity2);

      expect(item1.PK).toBe('EXCHANGE#NASDAQ');
      expect(item2.PK).toBe('EXCHANGE#NYSE');
      expect(item1.PK).not.toBe(item2.PK);
    });

    it('SKは常にMETADATAになる', () => {
      const entity1: ExchangeEntity = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const entity2: ExchangeEntity = {
        ...entity1,
        ExchangeID: 'NYSE',
        Name: 'New York Stock Exchange',
        Key: 'NYSE',
      };

      const item1 = mapper.toItem(entity1);
      const item2 = mapper.toItem(entity2);

      expect(item1.SK).toBe('METADATA');
      expect(item2.SK).toBe('METADATA');
      expect(item1.SK).toBe(item2.SK);
    });
  });

  describe('toEntity', () => {
    it('DynamoDBItem を ExchangeEntity に正しく変換する', () => {
      const item: DynamoDBItem = {
        PK: 'EXCHANGE#NASDAQ',
        SK: 'METADATA',
        Type: 'Exchange',
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const entity = mapper.toEntity(item);

      expect(entity).toEqual({
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });
    });

    it('DynamoDBItem の PK/SK を含まないエンティティを返す', () => {
      const item: DynamoDBItem = {
        PK: 'EXCHANGE#NASDAQ',
        SK: 'METADATA',
        Type: 'Exchange',
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const entity = mapper.toEntity(item);

      expect(entity).not.toHaveProperty('PK');
      expect(entity).not.toHaveProperty('SK');
      expect(entity).not.toHaveProperty('Type');
    });

    it('必須フィールドが欠けている場合はエラーをスローする', () => {
      const item: DynamoDBItem = {
        PK: 'EXCHANGE#NASDAQ',
        SK: 'METADATA',
        Type: 'Exchange',
        // ExchangeID が欠けている
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      expect(() => mapper.toEntity(item)).toThrow();
    });
  });

  describe('buildKeys', () => {
    it('exchangeId から PK/SK を正しく構築する', () => {
      const keys = mapper.buildKeys({ exchangeId: 'NASDAQ' });

      expect(keys).toEqual({
        pk: 'EXCHANGE#NASDAQ',
        sk: 'METADATA',
      });
    });

    it('異なる exchangeId で異なるキーを生成する', () => {
      const keys1 = mapper.buildKeys({ exchangeId: 'NASDAQ' });
      const keys2 = mapper.buildKeys({ exchangeId: 'NYSE' });

      expect(keys1.pk).not.toBe(keys2.pk);
      expect(keys1.sk).toBe(keys2.sk); // SKは常に METADATA
    });
  });

  describe('変換の往復', () => {
    it('Entity -> Item -> Entity の変換で元のエンティティに戻る', () => {
      const original: ExchangeEntity = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const item = mapper.toItem(original);
      const result = mapper.toEntity(item);

      expect(result).toEqual(original);
    });
  });
});
