/**
 * Stock Tracker Core - Ticker Mapper Unit Tests
 *
 * TickerMapperのユニットテスト
 */

import { InvalidEntityDataError } from '@nagiyu/aws';
import { TickerMapper } from '../../../src/mappers/ticker.mapper.js';
import type { TickerEntity } from '../../../src/entities/ticker.entity.js';

const TIMESTAMP = 1704067200000;

function buildEntity(overrides: Partial<TickerEntity> = {}): TickerEntity {
  return {
    tickerId: 'NSDQ:AAPL',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    exchangeId: 'NASDAQ',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'TICKER#NSDQ:AAPL',
    SK: 'METADATA',
    Type: 'Ticker',
    TickerID: 'NSDQ:AAPL',
    Symbol: 'AAPL',
    Name: 'Apple Inc.',
    ExchangeID: 'NASDAQ',
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('TickerMapper', () => {
  let mapper: TickerMapper;

  beforeEach(() => {
    mapper = new TickerMapper();
  });

  it('entityType は Ticker になる', () => {
    expect(mapper.entityType).toBe('Ticker');
  });

  describe('buildKeys', () => {
    it('tickerId から PK/SK を構築する', () => {
      expect(mapper.buildKeys({ tickerId: 'NSDQ:AAPL' })).toEqual({
        PK: 'TICKER#NSDQ:AAPL',
        SK: 'METADATA',
      });
    });

    it('PK が先頭のキー属性になる (条件付き書き込みの存在判定に使われる)', () => {
      expect(Object.keys(mapper.buildKeys({ tickerId: 'NSDQ:AAPL' }))).toEqual(['PK', 'SK']);
    });

    it('異なる tickerId で異なる PK を生成する', () => {
      const keys1 = mapper.buildKeys({ tickerId: 'NSDQ:AAPL' });
      const keys2 = mapper.buildKeys({ tickerId: 'NSDQ:NVDA' });

      expect(keys1.PK).not.toBe(keys2.PK);
      expect(keys1.SK).toBe(keys2.SK);
    });
  });

  describe('getKey', () => {
    it('Entity からビジネスキーを取り出す', () => {
      expect(mapper.getKey(buildEntity({ tickerId: 'NYSE:BA' }))).toEqual({ tickerId: 'NYSE:BA' });
    });
  });

  describe('toItem', () => {
    it('Entity を保存形式 (PascalCase・キー・Type・GSI3) の Item に変換する', () => {
      expect(mapper.toItem(buildEntity())).toEqual({
        PK: 'TICKER#NSDQ:AAPL',
        SK: 'METADATA',
        Type: 'Ticker',
        GSI3PK: 'NASDAQ',
        GSI3SK: 'TICKER#NSDQ:AAPL',
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
        CreatedAt: TIMESTAMP,
        UpdatedAt: TIMESTAMP,
      });
    });

    it('toItem のキー属性は buildKeys の結果と一致する', () => {
      const entity = buildEntity({ tickerId: 'NYSE:BA' });
      const item = mapper.toItem(entity);

      for (const [name, value] of Object.entries(mapper.buildKeys(mapper.getKey(entity)))) {
        expect(item[name]).toBe(value);
      }
    });
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目だけを保存用の属性名に変換する', () => {
      expect(mapper.toUpdateAttributes({ symbol: 'AAPL2', name: '新名称' })).toEqual({
        Symbol: 'AAPL2',
        Name: '新名称',
      });
    });

    it('undefined の項目は変更しない (属性に含めても値は undefined)', () => {
      const attributes = mapper.toUpdateAttributes({ name: undefined, symbol: 'X' });

      expect(attributes.Name).toBeUndefined();
      expect(attributes.Symbol).toBe('X');
    });

    it('exchangeId を変えるときは GSI3PK も付け直す', () => {
      expect(mapper.toUpdateAttributes({ exchangeId: 'NYSE' })).toEqual({
        ExchangeID: 'NYSE',
        GSI3PK: 'NYSE',
      });
    });

    it('tickerId を含めるときは GSI3SK も付け直す', () => {
      expect(mapper.toUpdateAttributes({ tickerId: 'NSDQ:NVDA' })).toEqual({
        TickerID: 'NSDQ:NVDA',
        GSI3SK: 'TICKER#NSDQ:NVDA',
      });
    });

    it('exchangeId と tickerId を含めなければ GSI3 キーには触れない', () => {
      const attributes = mapper.toUpdateAttributes({ name: 'X', createdAt: 1 });

      expect(attributes).not.toHaveProperty('GSI3PK');
      expect(attributes).not.toHaveProperty('GSI3SK');
      expect(attributes.CreatedAt).toBe(1);
    });

    it('必須項目を null にすると InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toUpdateAttributes({ name: null })).toThrow(InvalidEntityDataError);
    });
  });

  describe('toEntity', () => {
    it('Item を camelCase の Entity に変換する', () => {
      expect(mapper.toEntity(buildItem())).toEqual(buildEntity());
    });

    it('PK/SK/Type などの保存用の属性を Entity に含めない', () => {
      const entity = mapper.toEntity(buildItem({ GSI3PK: 'NASDAQ', GSI3SK: 'TICKER#NSDQ:AAPL' }));

      for (const name of ['PK', 'SK', 'Type', 'GSI3PK', 'GSI3SK']) {
        expect(entity).not.toHaveProperty(name);
      }
    });

    it.each(['TickerID', 'Symbol', 'Name', 'ExchangeID'])(
      '必須フィールド %s が欠けている場合は InvalidEntityDataError をスローする',
      (field) => {
        const item = buildItem();
        delete item[field];

        expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
      }
    );

    it('時刻が ISO 文字列で保存された旧形式のデータもミリ秒で読める', () => {
      const entity = mapper.toEntity(
        buildItem({
          CreatedAt: new Date(TIMESTAMP).toISOString(),
          UpdatedAt: new Date(TIMESTAMP).toISOString(),
        })
      );

      expect(entity.createdAt).toBe(TIMESTAMP);
      expect(entity.updatedAt).toBe(TIMESTAMP);
    });

    it('時刻がエポック秒で保存された旧形式のデータもミリ秒で読める', () => {
      const entity = mapper.toEntity(
        buildItem({ CreatedAt: TIMESTAMP / 1000, UpdatedAt: TIMESTAMP / 1000 })
      );

      expect(entity.createdAt).toBe(TIMESTAMP);
      expect(entity.updatedAt).toBe(TIMESTAMP);
    });

    it('時刻が欠けている場合は InvalidEntityDataError をスローする', () => {
      const item = buildItem();
      delete item.UpdatedAt;

      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });
  });

  describe('変換の往復', () => {
    it('Entity -> Item -> Entity の変換で元に戻る', () => {
      const original = buildEntity();

      expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
    });
  });
});
