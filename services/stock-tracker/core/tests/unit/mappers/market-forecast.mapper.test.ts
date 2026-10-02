/**
 * Stock Tracker Core - MarketForecast Mapper Unit Tests
 *
 * MarketForecastMapperのユニットテスト
 */
import { InvalidEntityDataError, type DynamoDBItem } from '@nagiyu/aws';
import { MarketForecastMapper } from '../../../src/mappers/market-forecast.mapper.js';
import type { MarketForecastEntity } from '../../../src/entities/market-forecast.entity.js';
import type { MarketOutcome } from '../../../src/forecast/index.js';

describe('MarketForecastMapper', () => {
  let mapper: MarketForecastMapper;

  const entity: MarketForecastEntity = {
    Market: 'US',
    Date: '2026-02-27',
    AxisValues: { 'market-range-avg': 0.08 },
    Probabilities: {
      MKT: {
        probability: 0.45,
        baseline: 0.4,
        neutralBand: { lower: -0.1, upper: 0.1 },
        bandHistory: null,
        lean: 'NEUTRAL',
        contributions: {},
        lowSampleAxes: [],
      },
    },
    ModelVersion: 'forecast-core-v1',
    Source: 'LIVE',
    CreatedAt: 1_700_000_000_000,
    UpdatedAt: 1_700_000_000_000,
  };

  beforeEach(() => {
    mapper = new MarketForecastMapper();
  });

  describe('toItem / toEntity', () => {
    it('PK/SK を正しく組み立てる（GSI は持たない）', () => {
      const item = mapper.toItem(entity);
      expect(item.PK).toBe('MARKETFORECAST#US');
      expect(item.SK).toBe('DATE#2026-02-27');
      expect(item.GSI4PK).toBeUndefined();
      expect(item.Type).toBe('MarketForecast');
    });

    it('往復変換で元の Entity と一致する', () => {
      const restored = mapper.toEntity(mapper.toItem(entity));
      expect(restored).toEqual(entity);
    });

    it('BackfilledAxes・Outcome がある場合は保持される', () => {
      const withExtras: MarketForecastEntity = {
        ...entity,
        BackfilledAxes: { 'new-axis': '2026-03-01' },
        Outcome: {
          nextDate: '2026-02-28',
          nextRange: 0.09,
          rangeRatio: 1.05,
          hit: { MKT: false },
          evaluatedAt: 1_700_100_000_000,
        },
      };
      const restored = mapper.toEntity(mapper.toItem(withExtras));
      expect(restored).toEqual(withExtras);
    });

    it('Probabilities がオブジェクトでない場合は InvalidEntityDataError を投げる', () => {
      const item = mapper.toItem(entity);
      const broken = { ...item, Probabilities: ['not', 'an', 'object'] } as unknown as DynamoDBItem;
      expect(() => mapper.toEntity(broken)).toThrow(InvalidEntityDataError);
    });
  });

  describe('toCreateItem', () => {
    it('CreatedAt/UpdatedAt に渡した時刻を使う', () => {
      const { CreatedAt: _c, UpdatedAt: _u, ...input } = entity;
      const item = mapper.toCreateItem(input, 1_700_200_000_000);
      expect(item.CreatedAt).toBe(1_700_200_000_000);
      expect(item.Outcome).toBeUndefined();
    });
  });

  describe('toSample', () => {
    it('フルアイテムから MarketSample を組み立てる', () => {
      const withOutcome: MarketForecastEntity = {
        ...entity,
        Outcome: {
          nextDate: '2026-02-28',
          nextRange: 0.09,
          rangeRatio: 1.05,
          hit: { MKT: true },
          evaluatedAt: 1_700_100_000_000,
        },
      };
      const sample = mapper.toSample(mapper.toItem(withOutcome));
      expect(sample).toEqual({
        market: 'US',
        date: '2026-02-27',
        axisValues: entity.AxisValues,
        outcome: { nextDate: '2026-02-28', hit: { MKT: true } },
        probabilities: { MKT: { probability: 0.45, baseline: 0.4 } },
      });
    });

    it('Outcome・Probabilities が無いプロジェクション読み出しでも動く', () => {
      const projected = { Market: 'US', Date: '2026-02-27', AxisValues: entity.AxisValues };
      const sample = mapper.toSample(projected);
      expect(sample).toEqual({ market: 'US', date: '2026-02-27', axisValues: entity.AxisValues });
    });
  });

  describe('buildKeys / buildPk', () => {
    it('ビジネスキーから PK/SK を構築する', () => {
      expect(mapper.buildKeys({ market: 'US', date: '2026-02-27' })).toEqual({
        pk: 'MARKETFORECAST#US',
        sk: 'DATE#2026-02-27',
      });
    });

    it('市場から PK を構築する', () => {
      expect(mapper.buildPk('JP')).toBe('MARKETFORECAST#JP');
    });
  });

  describe('toOutcomeAttribute', () => {
    it('識別子フィールド（market/date）を除いて変換する', () => {
      const outcome: MarketOutcome = {
        market: 'US',
        date: '2026-02-27',
        nextDate: '2026-02-28',
        nextRange: 0.09,
        rangeRatio: 1.05,
        hit: { MKT: true },
        evaluatedAt: 1_700_100_000_000,
      };
      expect(mapper.toOutcomeAttribute(outcome)).toEqual({
        nextDate: '2026-02-28',
        nextRange: 0.09,
        rangeRatio: 1.05,
        hit: { MKT: true },
        evaluatedAt: 1_700_100_000_000,
      });
    });

    it('rangeRatio が無い場合は含めない', () => {
      const outcome: MarketOutcome = {
        market: 'US',
        date: '2026-02-27',
        nextDate: '2026-02-28',
        nextRange: 0.09,
        hit: {},
        evaluatedAt: 1_700_100_000_000,
      };
      expect(mapper.toOutcomeAttribute(outcome).rangeRatio).toBeUndefined();
    });
  });
});
