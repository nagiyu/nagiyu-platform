/**
 * Stock Tracker Core - Exchange Mapper Unit Tests
 *
 * ExchangeMapperのユニットテスト
 */

import { REMOVE_ATTRIBUTE, InvalidEntityDataError } from '@nagiyu/aws';
import { ExchangeMapper } from '../../../src/mappers/exchange.mapper.js';
import type { ExchangeEntity } from '../../../src/entities/exchange.entity.js';
import { DEFAULT_PRICE_SOURCE } from '../../../src/entities/exchange.entity.js';

const TIMESTAMP = 1704067200000;

function buildEntity(overrides: Partial<ExchangeEntity> = {}): ExchangeEntity {
  return {
    exchangeId: 'NASDAQ',
    name: 'NASDAQ Stock Market',
    key: 'NSDQ',
    timezone: 'America/New_York',
    start: '04:00',
    end: '20:00',
    priceSource: 'tradingview',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'EXCHANGE#NASDAQ',
    SK: 'METADATA',
    Type: 'Exchange',
    ExchangeID: 'NASDAQ',
    Name: 'NASDAQ Stock Market',
    Key: 'NSDQ',
    Timezone: 'America/New_York',
    Start: '04:00',
    End: '20:00',
    PriceSource: 'tradingview',
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('ExchangeMapper', () => {
  let mapper: ExchangeMapper;

  beforeEach(() => {
    mapper = new ExchangeMapper();
  });

  it('entityType は Exchange になる', () => {
    expect(mapper.entityType).toBe('Exchange');
  });

  describe('buildKeys', () => {
    it('exchangeId から PK/SK を構築する', () => {
      expect(mapper.buildKeys({ exchangeId: 'NASDAQ' })).toEqual({
        PK: 'EXCHANGE#NASDAQ',
        SK: 'METADATA',
      });
    });

    it('PK が先頭のキー属性になる (条件付き書き込みの存在判定に使われる)', () => {
      expect(Object.keys(mapper.buildKeys({ exchangeId: 'NASDAQ' }))).toEqual(['PK', 'SK']);
    });

    it('異なる exchangeId で異なる PK を生成し、SK は常に METADATA になる', () => {
      const keys1 = mapper.buildKeys({ exchangeId: 'NASDAQ' });
      const keys2 = mapper.buildKeys({ exchangeId: 'NYSE' });

      expect(keys1.PK).not.toBe(keys2.PK);
      expect(keys1.SK).toBe('METADATA');
      expect(keys2.SK).toBe('METADATA');
    });
  });

  describe('getKey', () => {
    it('Entity からビジネスキーを取り出す', () => {
      expect(mapper.getKey(buildEntity({ exchangeId: 'NYSE' }))).toEqual({ exchangeId: 'NYSE' });
    });
  });

  describe('toItem', () => {
    it('Entity を保存形式 (PascalCase・キー・Type・GSI3) の Item に変換する', () => {
      expect(mapper.toItem(buildEntity())).toEqual({
        PK: 'EXCHANGE#NASDAQ',
        SK: 'METADATA',
        Type: 'Exchange',
        GSI3PK: 'EXCHANGES',
        GSI3SK: 'EXCHANGE#NASDAQ',
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
        PriceSource: 'tradingview',
        CreatedAt: TIMESTAMP,
        UpdatedAt: TIMESTAMP,
      });
    });

    it('時刻は数値ミリ秒のまま保存する', () => {
      const item = mapper.toItem(buildEntity());

      expect(item.CreatedAt).toBe(TIMESTAMP);
      expect(item.UpdatedAt).toBe(TIMESTAMP);
    });

    it('priceSource が finnhub の場合もそのまま変換する', () => {
      expect(mapper.toItem(buildEntity({ priceSource: 'finnhub' })).PriceSource).toBe('finnhub');
    });

    it('market が指定されている場合は Market 属性として保存する', () => {
      expect(mapper.toItem(buildEntity({ market: 'JP' })).Market).toBe('JP');
    });

    it('market が未指定の場合は Market 属性を含めない', () => {
      expect(mapper.toItem(buildEntity())).not.toHaveProperty('Market');
    });

    it('toItem のキー属性は buildKeys の結果と一致する', () => {
      const entity = buildEntity({ exchangeId: 'NYSE' });
      const item = mapper.toItem(entity);

      for (const [name, value] of Object.entries(mapper.buildKeys(mapper.getKey(entity)))) {
        expect(item[name]).toBe(value);
      }
    });
  });

  describe('toUpdateAttributes', () => {
    const KEY = { exchangeId: 'NASDAQ' };

    it('指定した項目に加えて、キーから作った GSI3 の属性を返す', () => {
      expect(mapper.toUpdateAttributes({ name: '新名称', timezone: 'Asia/Tokyo' }, KEY)).toEqual({
        Name: '新名称',
        Timezone: 'Asia/Tokyo',
        GSI3PK: 'EXCHANGES',
        GSI3SK: 'EXCHANGE#NASDAQ',
      });
    });

    it('changes が空でも GSI3 の属性を付け直す', () => {
      const attributes = mapper.toUpdateAttributes({}, { exchangeId: 'TSE' });

      expect(attributes.GSI3PK).toBe('EXCHANGES');
      expect(attributes.GSI3SK).toBe('EXCHANGE#TSE');
    });

    it('GSI3 の属性は changes ではなく key の exchangeId から作る', () => {
      expect(mapper.toUpdateAttributes({ name: 'X' }, { exchangeId: 'NYSE' }).GSI3SK).toBe(
        'EXCHANGE#NYSE'
      );
    });

    it('キー属性 (PK/SK) は返さない', () => {
      const attributes = mapper.toUpdateAttributes({ name: 'X' }, KEY);

      for (const name of Object.keys(mapper.buildKeys(KEY))) {
        expect(attributes).not.toHaveProperty(name);
      }
    });

    it('undefined の項目は変更しない (属性に含めても値は undefined)', () => {
      const attributes = mapper.toUpdateAttributes({ name: undefined, start: '09:00' }, KEY);

      expect(attributes.Name).toBeUndefined();
      expect(attributes.Start).toBe('09:00');
    });

    it('market が null のときは属性を削除する', () => {
      expect(mapper.toUpdateAttributes({ market: null }, KEY).Market).toBe(REMOVE_ATTRIBUTE);
    });

    it('market に値があるときは設定する', () => {
      expect(mapper.toUpdateAttributes({ market: 'US' }, KEY).Market).toBe('US');
    });

    it('priceSource も変換する', () => {
      expect(mapper.toUpdateAttributes({ priceSource: 'finnhub' }, KEY).PriceSource).toBe(
        'finnhub'
      );
    });

    it.each(['name', 'timezone', 'start', 'end', 'priceSource'] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null }, KEY)).toThrow(
          InvalidEntityDataError
        );
      }
    );

    it.each([
      ['exchangeId', { exchangeId: 'NASDAQ' }],
      ['key', { key: 'NSDQ' }],
      ['createdAt', { createdAt: TIMESTAMP }],
    ] as const)(
      '変更不可の項目 %s を含めると、値が同じでも InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes, KEY)).toThrow(InvalidEntityDataError);
      }
    );

    it('変更不可の項目を null にしても InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toUpdateAttributes({ key: null }, KEY)).toThrow(InvalidEntityDataError);
    });
  });

  describe('toEntity', () => {
    it('Item を camelCase の Entity に変換する', () => {
      expect(mapper.toEntity(buildItem())).toEqual(buildEntity());
    });

    it('PK/SK/Type などの保存用の属性を Entity に含めない', () => {
      const entity = mapper.toEntity(buildItem({ GSI3PK: 'EXCHANGES', GSI3SK: 'EXCHANGE#NASDAQ' }));

      for (const name of ['PK', 'SK', 'Type', 'GSI3PK', 'GSI3SK']) {
        expect(entity).not.toHaveProperty(name);
      }
    });

    it('必須フィールドが欠けている場合は InvalidEntityDataError をスローする', () => {
      const item = buildItem();
      delete item.ExchangeID;

      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });

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

    it('時刻が不正な形式のときは InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ CreatedAt: 'not-a-date' }))).toThrow(
        InvalidEntityDataError
      );
    });

    it('PriceSource 属性が存在しない既存レコードは DEFAULT_PRICE_SOURCE にフォールバックする', () => {
      const item = buildItem();
      delete item.PriceSource;

      const entity = mapper.toEntity(item);

      expect(entity.priceSource).toBe(DEFAULT_PRICE_SOURCE);
      expect(entity.priceSource).toBe('tradingview');
    });

    it('PriceSource が無効な値の場合は DEFAULT_PRICE_SOURCE にフォールバックする', () => {
      expect(mapper.toEntity(buildItem({ PriceSource: 'invalid-source' })).priceSource).toBe(
        DEFAULT_PRICE_SOURCE
      );
    });

    it('PriceSource が finnhub の場合は finnhub を返す', () => {
      expect(mapper.toEntity(buildItem({ PriceSource: 'finnhub' })).priceSource).toBe('finnhub');
    });

    it('Market 属性が存在しない場合は undefined（未設定）を返す', () => {
      expect(mapper.toEntity(buildItem()).market).toBeUndefined();
    });

    it.each(['JP', 'US'] as const)('Market が %s の場合はそのまま返す', (market) => {
      expect(mapper.toEntity(buildItem({ Market: market })).market).toBe(market);
    });

    it('Market が無効な値の場合は undefined（未設定）にフォールバックする', () => {
      expect(mapper.toEntity(buildItem({ Market: 'invalid-market' })).market).toBeUndefined();
    });
  });

  describe('変換の往復', () => {
    it.each([
      ['tradingview', buildEntity()],
      ['finnhub', buildEntity({ priceSource: 'finnhub' })],
      ['market あり', buildEntity({ exchangeId: 'TSE', market: 'JP' })],
    ])('Entity -> Item -> Entity の変換で元に戻る (%s)', (_label, original) => {
      expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
    });

    it('market なしの往復では market が未設定のまま戻る', () => {
      const result = mapper.toEntity(mapper.toItem(buildEntity()));

      expect(result.market).toBeUndefined();
    });
  });
});
