/**
 * Stock Tracker Core - Ticker Mapper Unit Tests
 *
 * TickerMapperのユニットテスト
 */

import { InvalidEntityDataError } from '@nagiyu/aws';
import {
  TickerMapper,
  buildTickerGsi3Pk,
  buildTickerGsi3Sk,
} from '../../../src/mappers/ticker.mapper.js';
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

    it('GSI3 のキーは付け直さない (tickerId と exchangeId は変えられないため)', () => {
      const attributes = mapper.toUpdateAttributes({ name: 'X' });

      expect(attributes).not.toHaveProperty('GSI3PK');
      expect(attributes).not.toHaveProperty('GSI3SK');
    });

    it.each(['symbol', 'name'] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['tickerId', { tickerId: 'NSDQ:AAPL' }],
      ['exchangeId', { exchangeId: 'NASDAQ' }],
      ['createdAt', { createdAt: TIMESTAMP }],
    ] as const)(
      '変更不可の項目 %s を含めると、値が同じでも InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes)).toThrow(InvalidEntityDataError);
      }
    );

    it('変更不可の項目を null にしても InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toUpdateAttributes({ exchangeId: null })).toThrow(InvalidEntityDataError);
    });
  });

  describe('GSI3 のキー', () => {
    it('buildTickerGsi3Pk は取引所 ID をそのまま返す', () => {
      expect(buildTickerGsi3Pk('NASDAQ')).toBe('NASDAQ');
    });

    it('buildTickerGsi3Sk は TICKER# を前置したティッカー ID を返す', () => {
      expect(buildTickerGsi3Sk('NSDQ:AAPL')).toBe('TICKER#NSDQ:AAPL');
    });

    it('toItem の GSI3 属性はヘルパーの結果と一致する', () => {
      const item = mapper.toItem(buildEntity());

      expect(item.GSI3PK).toBe(buildTickerGsi3Pk('NASDAQ'));
      expect(item.GSI3SK).toBe(buildTickerGsi3Sk('NSDQ:AAPL'));
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
