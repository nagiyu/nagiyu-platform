/**
 * Stock Tracker Core - Forecast Mapper Unit Tests
 *
 * ForecastMapperのユニットテスト
 */
import { InvalidEntityDataError, type DynamoDBItem } from '@nagiyu/aws';
import { ForecastMapper } from '../../../src/mappers/forecast.mapper.js';
import type { ForecastEntity } from '../../../src/entities/forecast.entity.js';
import type { TickerOutcome } from '../../../src/forecast/index.js';

describe('ForecastMapper', () => {
  let mapper: ForecastMapper;

  const entity: ForecastEntity = {
    TickerID: 'NSDQ:AAPL',
    ExchangeID: 'NASDAQ',
    Market: 'US',
    Date: '2026-02-27',
    AxisValues: { 'pattern-1': true, 'range-today': 0.12 },
    Normal: { range: 0.03, volume: 1_000_000 },
    Probabilities: {
      DIR: {
        probability: 0.52,
        baseline: 0.5,
        neutralBand: { lower: -0.05, upper: 0.05 },
        bandHistory: null,
        lean: 'NEUTRAL',
        contributions: { 'pattern-1': 0.01 },
        lowSampleAxes: [],
      },
    },
    ModelVersion: 'forecast-core-v1',
    Source: 'LIVE',
    CreatedAt: 1_700_000_000_000,
    UpdatedAt: 1_700_000_000_000,
  };

  beforeEach(() => {
    mapper = new ForecastMapper();
  });

  describe('toItem / toEntity', () => {
    it('PK/SK/GSI4 を正しく組み立てる', () => {
      const item = mapper.toItem(entity);
      expect(item.PK).toBe('FORECAST#NSDQ:AAPL');
      expect(item.SK).toBe('DATE#2026-02-27');
      expect(item.GSI4PK).toBe('FORECAST#NASDAQ');
      expect(item.GSI4SK).toBe('DATE#2026-02-27#NSDQ:AAPL');
      expect(item.Type).toBe('Forecast');
    });

    it('往復変換で元の Entity と一致する', () => {
      const item = mapper.toItem(entity);
      const restored = mapper.toEntity(item);
      expect(restored).toEqual(entity);
    });

    it('BackfilledAxes・Outcome がある場合は保持される', () => {
      const withExtras: ForecastEntity = {
        ...entity,
        BackfilledAxes: { 'new-axis': '2026-03-01' },
        Outcome: {
          nextDate: '2026-02-28',
          nextReturn: 0.01,
          excessReturn: 0.005,
          nextRange: 0.02,
          rangeRatio: 1.1,
          hit: { DIR: true, VOL: false },
          evaluatedAt: 1_700_100_000_000,
        },
      };
      const item = mapper.toItem(withExtras);
      const restored = mapper.toEntity(item);
      expect(restored).toEqual(withExtras);
    });

    it('Outcome に除外理由がある場合も保持される', () => {
      const excluded: ForecastEntity = {
        ...entity,
        Outcome: {
          nextDate: '2026-02-28',
          nextReturn: 0.5,
          nextRange: 0.02,
          hit: {},
          excludedReason: 'EXTREME_RETURN',
          evaluatedAt: 1_700_100_000_000,
        },
      };
      const restored = mapper.toEntity(mapper.toItem(excluded));
      expect(restored.Outcome?.excludedReason).toBe('EXTREME_RETURN');
    });

    it('AxisValues がオブジェクトでない場合は InvalidEntityDataError を投げる', () => {
      const item = mapper.toItem(entity);
      const broken = { ...item, AxisValues: 'not-an-object' } as unknown as DynamoDBItem;
      expect(() => mapper.toEntity(broken)).toThrow(InvalidEntityDataError);
    });
  });

  describe('toCreateItem', () => {
    it('CreatedAt/UpdatedAt に渡した時刻を使う', () => {
      const { CreatedAt: _c, UpdatedAt: _u, ...input } = entity;
      const item = mapper.toCreateItem(input, 1_700_200_000_000);
      expect(item.CreatedAt).toBe(1_700_200_000_000);
      expect(item.UpdatedAt).toBe(1_700_200_000_000);
      expect(item.Outcome).toBeUndefined();
    });
  });

  describe('toSample', () => {
    it('フルアイテムから TickerSample を組み立てる', () => {
      const withOutcome: ForecastEntity = {
        ...entity,
        Probabilities: {
          DIR: entity.Probabilities.DIR!,
          VOL: {
            probability: 0.6,
            baseline: 0.4,
            neutralBand: { lower: -0.05, upper: 0.1 },
            bandHistory: null,
            lean: 'HIGH',
            contributions: {},
            lowSampleAxes: [],
          },
        },
        Outcome: {
          nextDate: '2026-02-28',
          nextReturn: 0.01,
          excessReturn: 0.005,
          nextRange: 0.02,
          rangeRatio: 1.1,
          hit: { DIR: true, VOL: false },
          evaluatedAt: 1_700_100_000_000,
        },
      };
      const item = mapper.toItem(withOutcome);
      const sample = mapper.toSample(item);

      expect(sample).toEqual({
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        market: 'US',
        date: '2026-02-27',
        axisValues: entity.AxisValues,
        normal: entity.Normal,
        outcome: {
          nextDate: '2026-02-28',
          hit: { DIR: true, VOL: false },
          excessReturn: 0.005,
        },
        probabilities: {
          DIR: { probability: 0.52, baseline: 0.5 },
          VOL: { probability: 0.6, baseline: 0.4 },
        },
      });
    });

    it('ProjectionExpression で一部属性が欠けていても動く（Normal・Outcome・Probabilities 省略）', () => {
      const projected = {
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Market: 'US',
        Date: '2026-02-27',
        AxisValues: entity.AxisValues,
      };
      const sample = mapper.toSample(projected);
      expect(sample).toEqual({
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        market: 'US',
        date: '2026-02-27',
        axisValues: entity.AxisValues,
      });
    });

    it('Probabilities があっても DIR・VOL いずれも値が無ければ probabilities を省く', () => {
      const projected = {
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Market: 'US',
        Date: '2026-02-27',
        AxisValues: entity.AxisValues,
        Probabilities: {},
      };
      const sample = mapper.toSample(projected);
      expect(sample.probabilities).toBeUndefined();
    });
  });

  describe('buildKeys / buildGsi4Pk', () => {
    it('ビジネスキーから PK/SK を構築する', () => {
      expect(mapper.buildKeys({ tickerId: 'NSDQ:AAPL', date: '2026-02-27' })).toEqual({
        pk: 'FORECAST#NSDQ:AAPL',
        sk: 'DATE#2026-02-27',
      });
    });

    it('取引所IDから GSI4PK を構築する', () => {
      expect(mapper.buildGsi4Pk('NASDAQ')).toBe('FORECAST#NASDAQ');
    });
  });

  describe('toOutcomeAttribute', () => {
    it('識別子フィールド（tickerId/exchangeId/market/date）を除いて変換する', () => {
      const outcome: TickerOutcome = {
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        market: 'US',
        date: '2026-02-27',
        nextDate: '2026-02-28',
        nextReturn: 0.01,
        excessReturn: 0.005,
        nextRange: 0.02,
        rangeRatio: 1.1,
        hit: { DIR: true },
        evaluatedAt: 1_700_100_000_000,
      };
      expect(mapper.toOutcomeAttribute(outcome)).toEqual({
        nextDate: '2026-02-28',
        nextReturn: 0.01,
        excessReturn: 0.005,
        nextRange: 0.02,
        rangeRatio: 1.1,
        hit: { DIR: true },
        evaluatedAt: 1_700_100_000_000,
      });
    });

    it('省略可能フィールドが無い場合は含めない', () => {
      const outcome: TickerOutcome = {
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        market: 'US',
        date: '2026-02-27',
        nextDate: '2026-02-28',
        nextReturn: 0.5,
        nextRange: 0.02,
        hit: {},
        excludedReason: 'EXTREME_RETURN',
        evaluatedAt: 1_700_100_000_000,
      };
      const attribute = mapper.toOutcomeAttribute(outcome);
      expect(attribute.excessReturn).toBeUndefined();
      expect(attribute.rangeRatio).toBeUndefined();
      expect(attribute.excludedReason).toBe('EXTREME_RETURN');
    });
  });
});
