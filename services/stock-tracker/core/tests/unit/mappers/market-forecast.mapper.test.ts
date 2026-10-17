/**
 * Stock Tracker Core - MarketForecast Mapper Unit Tests
 *
 * MarketForecastMapperのユニットテスト
 */
import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import {
  MarketForecastMapper,
  buildMarketForecastPk,
  buildMarketForecastSk,
  buildMarketForecastSkUpperBound,
} from '../../../src/mappers/market-forecast.mapper.js';
import type {
  MarketForecastEntity,
  MarketForecastOutcome,
} from '../../../src/entities/market-forecast.entity.js';
import type { MarketOutcome } from '../../../src/forecast/index.js';

const TIMESTAMP = 1_700_000_000_000;
const KEY = { market: 'US', date: '2026-02-27' } as const;

const OUTCOME: MarketForecastOutcome = {
  nextDate: '2026-02-28',
  nextRange: 0.09,
  rangeRatio: 1.05,
  hit: { MKT: true },
  evaluatedAt: 1_700_100_000_000,
};

function buildEntity(overrides: Partial<MarketForecastEntity> = {}): MarketForecastEntity {
  return {
    market: 'US',
    date: '2026-02-27',
    axisValues: { 'market-range-avg': 0.08 },
    probabilities: {
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
    modelVersion: 'forecast-core-v1',
    source: 'LIVE',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const entity = buildEntity();
  return {
    PK: 'MARKETFORECAST#US',
    SK: 'DATE#2026-02-27',
    Type: 'MarketForecast',
    Market: 'US',
    Date: '2026-02-27',
    AxisValues: entity.axisValues,
    Probabilities: entity.probabilities,
    ModelVersion: 'forecast-core-v1',
    Source: 'LIVE',
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('MarketForecastMapper', () => {
  let mapper: MarketForecastMapper;

  beforeEach(() => {
    mapper = new MarketForecastMapper();
  });

  it('entityType は MarketForecast になる', () => {
    expect(mapper.entityType).toBe('MarketForecast');
  });

  describe('キーの組み立て', () => {
    it('ビジネスキーから PK/SK を構築する', () => {
      expect(mapper.buildKeys(KEY)).toEqual({ PK: 'MARKETFORECAST#US', SK: 'DATE#2026-02-27' });
    });

    it('PK が先頭のキー属性になる (条件付き書き込みの存在判定に使われる)', () => {
      expect(Object.keys(mapper.buildKeys(KEY))).toEqual(['PK', 'SK']);
    });

    it('Entity からビジネスキーを取り出す', () => {
      expect(mapper.getKey(buildEntity())).toEqual(KEY);
    });

    it('期間 Query 用に市場から PK、日付から SK と範囲の上限を構築する', () => {
      expect(buildMarketForecastPk('JP')).toBe('MARKETFORECAST#JP');
      expect(buildMarketForecastSk('2026-02-27')).toBe('DATE#2026-02-27');
      expect(buildMarketForecastSkUpperBound('2026-02-27')).toBe('DATE#2026-02-27#~');
    });

    it('範囲の上限は同じ日付の SK より大きい', () => {
      expect(
        buildMarketForecastSkUpperBound('2026-02-27') > buildMarketForecastSk('2026-02-27')
      ).toBe(true);
    });
  });

  describe('toItem', () => {
    it('Entity を保存形式 (PascalCase・キー・Type) の Item に変換する。GSI は持たない', () => {
      const item = mapper.toItem(buildEntity());

      expect(item).toEqual(buildItem());
      expect(item).not.toHaveProperty('GSI4PK');
    });

    it('backfilledAxes・outcome があれば属性として保存する', () => {
      const item = mapper.toItem(
        buildEntity({ backfilledAxes: { 'new-axis': '2026-03-01' }, outcome: OUTCOME })
      );

      expect(item.BackfilledAxes).toEqual({ 'new-axis': '2026-03-01' });
      expect(item.Outcome).toEqual(OUTCOME);
    });

    it('backfilledAxes・outcome が未設定なら属性を含めない', () => {
      const item = mapper.toItem(buildEntity());

      expect(item).not.toHaveProperty('BackfilledAxes');
      expect(item).not.toHaveProperty('Outcome');
    });

    it('toItem のキー属性は buildKeys の結果と一致する', () => {
      const entity = buildEntity({ market: 'JP', date: '2026-03-02' });
      const item = mapper.toItem(entity);

      for (const [name, value] of Object.entries(mapper.buildKeys(mapper.getKey(entity)))) {
        expect(item[name]).toBe(value);
      }
    });
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目だけを返す (キーから作る属性はない)', () => {
      expect(mapper.toUpdateAttributes({ outcome: OUTCOME, modelVersion: 'v2' })).toEqual({
        ModelVersion: 'v2',
        Outcome: OUTCOME,
      });
    });

    it('undefined の項目は変更しない (属性に含めても値は undefined)', () => {
      const attributes = mapper.toUpdateAttributes({ source: undefined, modelVersion: 'v2' });

      expect(attributes.Source).toBeUndefined();
      expect(attributes.ModelVersion).toBe('v2');
    });

    it.each([
      ['backfilledAxes', 'BackfilledAxes'],
      ['outcome', 'Outcome'],
    ] as const)('任意項目 %s を null にすると属性を削除する', (field, attribute) => {
      expect(mapper.toUpdateAttributes({ [field]: null })[attribute]).toBe(REMOVE_ATTRIBUTE);
    });

    it.each(['axisValues', 'probabilities', 'modelVersion', 'source'] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['market', { market: 'US' }],
      ['date', { date: '2026-02-27' }],
      ['createdAt', { createdAt: TIMESTAMP }],
    ] as const)(
      '変更不可の項目 %s を含めると、値が同じでも InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes)).toThrow(InvalidEntityDataError);
      }
    );
  });

  describe('toEntity', () => {
    it('Item を camelCase の Entity に変換する', () => {
      expect(mapper.toEntity(buildItem())).toEqual(buildEntity());
    });

    it('PK/SK/Type などの保存用の属性を Entity に含めない', () => {
      const entity = mapper.toEntity(buildItem());

      for (const name of ['PK', 'SK', 'Type']) {
        expect(entity).not.toHaveProperty(name);
      }
    });

    it('BackfilledAxes・Outcome がある場合は保持される', () => {
      const entity = mapper.toEntity(
        buildItem({ BackfilledAxes: { 'new-axis': '2026-03-01' }, Outcome: OUTCOME })
      );

      expect(entity.backfilledAxes).toEqual({ 'new-axis': '2026-03-01' });
      expect(entity.outcome).toEqual(OUTCOME);
    });

    it.each(['AxisValues', 'Probabilities', 'BackfilledAxes', 'Outcome'])(
      '%s がオブジェクトでない場合は InvalidEntityDataError をスローする',
      (attribute) => {
        expect(() => mapper.toEntity(buildItem({ [attribute]: ['not', 'an', 'object'] }))).toThrow(
          InvalidEntityDataError
        );
      }
    );

    it('必須フィールドが欠けている場合は InvalidEntityDataError をスローする', () => {
      const item = buildItem();
      delete item.Market;

      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });

    it('Source が不正な場合は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ Source: 'UNKNOWN' }))).toThrow(
        InvalidEntityDataError
      );
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
  });

  describe('変換の往復', () => {
    it.each([
      ['予測部分のみ', buildEntity()],
      [
        'backfilledAxes・outcome あり',
        buildEntity({ backfilledAxes: { 'new-axis': '2026-03-01' }, outcome: OUTCOME }),
      ],
    ])('Entity -> Item -> Entity の変換で元に戻る (%s)', (_label, original) => {
      expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
    });
  });

  describe('toSample', () => {
    it('フルアイテムから MarketSample を組み立てる', () => {
      const sample = mapper.toSample(mapper.toItem(buildEntity({ outcome: OUTCOME })));

      expect(sample).toEqual({
        market: 'US',
        date: '2026-02-27',
        axisValues: buildEntity().axisValues,
        outcome: { nextDate: '2026-02-28', hit: { MKT: true } },
        probabilities: { MKT: { probability: 0.45, baseline: 0.4 } },
      });
    });

    it('Outcome に hit が無くても、空の hit として読む', () => {
      const sample = mapper.toSample(
        buildItem({ Outcome: { nextDate: '2026-02-28', evaluatedAt: 1 } })
      );

      expect(sample.outcome).toEqual({ nextDate: '2026-02-28', hit: {} });
    });

    it('Outcome・Probabilities が無いプロジェクション読み出しでも動く', () => {
      const sample = mapper.toSample({
        Market: 'US',
        Date: '2026-02-27',
        AxisValues: buildEntity().axisValues,
      });

      expect(sample).toEqual({
        market: 'US',
        date: '2026-02-27',
        axisValues: buildEntity().axisValues,
      });
    });

    it('Probabilities に MKT が無ければ probabilities を省く', () => {
      expect(mapper.toSample(buildItem({ Probabilities: {} })).probabilities).toBeUndefined();
    });
  });

  describe('toOutcomeAttribute', () => {
    function buildOutcome(overrides: Partial<MarketOutcome> = {}): MarketOutcome {
      return {
        market: 'US',
        date: '2026-02-27',
        nextDate: '2026-02-28',
        nextRange: 0.09,
        rangeRatio: 1.05,
        hit: { MKT: true },
        evaluatedAt: 1_700_100_000_000,
        ...overrides,
      };
    }

    it('識別子フィールド (market/date) を除いて変換する', () => {
      expect(mapper.toOutcomeAttribute(buildOutcome())).toEqual(OUTCOME);
    });

    it('rangeRatio が無い場合は含めない', () => {
      expect(mapper.toOutcomeAttribute(buildOutcome({ rangeRatio: undefined }))).not.toHaveProperty(
        'rangeRatio'
      );
    });
  });
});
