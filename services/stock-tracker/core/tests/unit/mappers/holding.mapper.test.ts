/**
 * Stock Tracker Core - Holding Mapper Unit Tests
 *
 * HoldingMapperのユニットテスト
 */

import { InvalidEntityDataError } from '@nagiyu/aws';
import {
  HoldingMapper,
  buildHoldingGsi1Pk,
  buildHoldingGsi1Sk,
} from '../../../src/mappers/holding.mapper.js';
import type { HoldingEntity } from '../../../src/entities/holding.entity.js';

const TIMESTAMP = 1704067200000;

function buildEntity(overrides: Partial<HoldingEntity> = {}): HoldingEntity {
  return {
    userId: 'user-123',
    tickerId: 'NSDQ:AAPL',
    exchangeId: 'NASDAQ',
    quantity: 10.5,
    averagePrice: 150.25,
    currency: 'USD',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#user-123',
    SK: 'HOLDING#NSDQ:AAPL',
    Type: 'Holding',
    UserID: 'user-123',
    TickerID: 'NSDQ:AAPL',
    ExchangeID: 'NASDAQ',
    Quantity: 10.5,
    AveragePrice: 150.25,
    Currency: 'USD',
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('HoldingMapper', () => {
  let mapper: HoldingMapper;

  beforeEach(() => {
    mapper = new HoldingMapper();
  });

  it('entityType は Holding になる', () => {
    expect(mapper.entityType).toBe('Holding');
  });

  describe('buildKeys', () => {
    it('ビジネスキーから PK/SK を構築する', () => {
      expect(mapper.buildKeys({ userId: 'user-123', tickerId: 'NSDQ:AAPL' })).toEqual({
        PK: 'USER#user-123',
        SK: 'HOLDING#NSDQ:AAPL',
      });
    });

    it('PK が先頭のキー属性になる (条件付き書き込みの存在判定に使われる)', () => {
      expect(Object.keys(mapper.buildKeys({ userId: 'user-123', tickerId: 'NSDQ:AAPL' }))).toEqual([
        'PK',
        'SK',
      ]);
    });

    it('異なるユーザーIDで異なる PK を生成する', () => {
      const keys1 = mapper.buildKeys({ userId: 'user-123', tickerId: 'NSDQ:AAPL' });
      const keys2 = mapper.buildKeys({ userId: 'user-456', tickerId: 'NSDQ:AAPL' });

      expect(keys1.PK).not.toBe(keys2.PK);
      expect(keys1.SK).toBe(keys2.SK);
    });

    it('異なるティッカーIDで異なる SK を生成する', () => {
      const keys1 = mapper.buildKeys({ userId: 'user-123', tickerId: 'NSDQ:AAPL' });
      const keys2 = mapper.buildKeys({ userId: 'user-123', tickerId: 'NSDQ:NVDA' });

      expect(keys1.PK).toBe(keys2.PK);
      expect(keys1.SK).not.toBe(keys2.SK);
    });
  });

  describe('getKey', () => {
    it('Entity からビジネスキーを取り出す', () => {
      expect(mapper.getKey(buildEntity({ userId: 'user-456', tickerId: 'NYSE:BA' }))).toEqual({
        userId: 'user-456',
        tickerId: 'NYSE:BA',
      });
    });
  });

  describe('toItem', () => {
    it('Entity を保存形式 (PascalCase・キー・Type・GSI1) の Item に変換する', () => {
      expect(mapper.toItem(buildEntity())).toEqual({
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
        CreatedAt: TIMESTAMP,
        UpdatedAt: TIMESTAMP,
      });
    });

    it('toItem のキー属性は buildKeys の結果と一致する', () => {
      const entity = buildEntity({ userId: 'user-456', tickerId: 'NYSE:BA' });
      const item = mapper.toItem(entity);

      for (const [name, value] of Object.entries(mapper.buildKeys(mapper.getKey(entity)))) {
        expect(item[name]).toBe(value);
      }
    });
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目だけを保存用の属性名に変換する', () => {
      expect(
        mapper.toUpdateAttributes({ quantity: 20, averagePrice: 155, currency: 'JPY' })
      ).toEqual({
        Quantity: 20,
        AveragePrice: 155,
        Currency: 'JPY',
      });
    });

    it('undefined の項目は変更しない (属性に含めても値は undefined)', () => {
      const attributes = mapper.toUpdateAttributes({ quantity: undefined, currency: 'JPY' });

      expect(attributes.Quantity).toBeUndefined();
      expect(attributes.Currency).toBe('JPY');
    });

    it('GSI1 のキーは付け直さない (userId と tickerId は変えられないため)', () => {
      const attributes = mapper.toUpdateAttributes({ quantity: 20 });

      expect(attributes).not.toHaveProperty('GSI1PK');
      expect(attributes).not.toHaveProperty('GSI1SK');
    });

    it.each(['quantity', 'averagePrice', 'currency'] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['userId', { userId: 'user-123' }],
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

  describe('GSI1 のキー', () => {
    it('buildHoldingGsi1Pk はユーザー ID をそのまま返す', () => {
      expect(buildHoldingGsi1Pk('user-123')).toBe('user-123');
    });

    it('buildHoldingGsi1Sk は Holding# を前置したティッカー ID を返す', () => {
      expect(buildHoldingGsi1Sk('NSDQ:AAPL')).toBe('Holding#NSDQ:AAPL');
    });

    it('toItem の GSI1 属性はヘルパーの結果と一致する', () => {
      const item = mapper.toItem(buildEntity());

      expect(item.GSI1PK).toBe(buildHoldingGsi1Pk('user-123'));
      expect(item.GSI1SK).toBe(buildHoldingGsi1Sk('NSDQ:AAPL'));
    });
  });

  describe('toEntity', () => {
    it('Item を camelCase の Entity に変換する', () => {
      expect(mapper.toEntity(buildItem())).toEqual(buildEntity());
    });

    it('PK/SK/Type などの保存用の属性を Entity に含めない', () => {
      const entity = mapper.toEntity(
        buildItem({ GSI1PK: 'user-123', GSI1SK: 'Holding#NSDQ:AAPL' })
      );

      for (const name of ['PK', 'SK', 'Type', 'GSI1PK', 'GSI1SK']) {
        expect(entity).not.toHaveProperty(name);
      }
    });

    it.each(['UserID', 'TickerID', 'ExchangeID', 'Quantity', 'AveragePrice', 'Currency'])(
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
