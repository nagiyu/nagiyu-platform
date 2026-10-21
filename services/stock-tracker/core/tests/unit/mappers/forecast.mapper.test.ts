/**
 * Stock Tracker Core - Forecast Mapper Unit Tests
 *
 * ForecastMapperのユニットテスト
 */
import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import {
  ForecastMapper,
  FORECAST_SAMPLE_ATTRIBUTE_PATHS,
  buildForecastGsi4Pk,
} from '../../../src/mappers/forecast.mapper.js';
import type { ForecastEntity, ForecastOutcome } from '../../../src/entities/forecast.entity.js';
import type { TickerOutcome } from '../../../src/forecast/index.js';

const TIMESTAMP = 1_700_000_000_000;
const KEY = { tickerId: 'NSDQ:AAPL', date: '2026-02-27' };

const OUTCOME: ForecastOutcome = {
  nextDate: '2026-02-28',
  nextReturn: 0.01,
  excessReturn: 0.005,
  nextRange: 0.02,
  rangeRatio: 1.1,
  hit: { DIR: true, VOL: false },
  evaluatedAt: 1_700_100_000_000,
};

function buildEntity(overrides: Partial<ForecastEntity> = {}): ForecastEntity {
  return {
    tickerId: 'NSDQ:AAPL',
    exchangeId: 'NASDAQ',
    market: 'US',
    date: '2026-02-27',
    axisValues: { 'pattern-1': true, 'range-today': 0.12 },
    normal: { range: 0.03, volume: 1_000_000 },
    probabilities: {
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
    PK: 'FORECAST#NSDQ:AAPL',
    SK: 'DATE#2026-02-27',
    Type: 'Forecast',
    GSI4PK: 'FORECAST#NASDAQ',
    GSI4SK: 'DATE#2026-02-27#NSDQ:AAPL',
    TickerID: 'NSDQ:AAPL',
    ExchangeID: 'NASDAQ',
    Market: 'US',
    Date: '2026-02-27',
    AxisValues: entity.axisValues,
    Normal: entity.normal,
    Probabilities: entity.probabilities,
    ModelVersion: 'forecast-core-v1',
    Source: 'LIVE',
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('ForecastMapper', () => {
  let mapper: ForecastMapper;

  beforeEach(() => {
    mapper = new ForecastMapper();
  });

  it('entityType は Forecast になる', () => {
    expect(mapper.entityType).toBe('Forecast');
  });

  describe('buildKeys / getKey', () => {
    it('ビジネスキーから PK/SK を構築する', () => {
      expect(mapper.buildKeys(KEY)).toEqual({ PK: 'FORECAST#NSDQ:AAPL', SK: 'DATE#2026-02-27' });
    });

    it('PK が先頭のキー属性になる (条件付き書き込みの存在判定に使われる)', () => {
      expect(Object.keys(mapper.buildKeys(KEY))).toEqual(['PK', 'SK']);
    });

    it('Entity からビジネスキーを取り出す', () => {
      expect(mapper.getKey(buildEntity())).toEqual(KEY);
    });
  });

  describe('buildForecastGsi4Pk', () => {
    it('取引所IDに接頭辞を付けて、日次サマリーの GSI4PK と衝突しない値にする', () => {
      expect(buildForecastGsi4Pk('NASDAQ')).toBe('FORECAST#NASDAQ');
    });
  });

  describe('toItem', () => {
    it('Entity を保存形式 (PascalCase・キー・Type・GSI4) の Item に変換する', () => {
      expect(mapper.toItem(buildEntity())).toEqual(buildItem());
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
      const entity = buildEntity({ tickerId: 'TSE:7203', date: '2026-03-02' });
      const item = mapper.toItem(entity);

      for (const [name, value] of Object.entries(mapper.buildKeys(mapper.getKey(entity)))) {
        expect(item[name]).toBe(value);
      }
    });
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目に加えて、キーから作った GSI4SK を返す', () => {
      expect(mapper.toUpdateAttributes({ outcome: OUTCOME, modelVersion: 'v2' }, KEY)).toEqual({
        GSI4SK: 'DATE#2026-02-27#NSDQ:AAPL',
        ModelVersion: 'v2',
        Outcome: OUTCOME,
      });
    });

    it('GSI4SK は changes ではなく key から作る', () => {
      expect(
        mapper.toUpdateAttributes({}, { tickerId: 'TSE:7203', date: '2026-03-02' }).GSI4SK
      ).toBe('DATE#2026-03-02#TSE:7203');
    });

    it('exchangeId を変えるときだけ GSI4PK を付け直す', () => {
      const withExchange = mapper.toUpdateAttributes({ exchangeId: 'NYSE' }, KEY);
      const withoutExchange = mapper.toUpdateAttributes({ modelVersion: 'v2' }, KEY);

      expect(withExchange.ExchangeID).toBe('NYSE');
      expect(withExchange.GSI4PK).toBe('FORECAST#NYSE');
      expect(withoutExchange.GSI4PK).toBeUndefined();
    });

    it('キー属性 (PK/SK) は返さない', () => {
      const attributes = mapper.toUpdateAttributes({ modelVersion: 'v2' }, KEY);

      for (const name of Object.keys(mapper.buildKeys(KEY))) {
        expect(attributes).not.toHaveProperty(name);
      }
    });

    it('undefined の項目は変更しない (属性に含めても値は undefined)', () => {
      const attributes = mapper.toUpdateAttributes({ market: undefined, source: 'REPLAY' }, KEY);

      expect(attributes.Market).toBeUndefined();
      expect(attributes.Source).toBe('REPLAY');
    });

    it.each([
      ['backfilledAxes', 'BackfilledAxes'],
      ['outcome', 'Outcome'],
    ] as const)('任意項目 %s を null にすると属性を削除する', (field, attribute) => {
      expect(mapper.toUpdateAttributes({ [field]: null }, KEY)[attribute]).toBe(REMOVE_ATTRIBUTE);
    });

    it.each([
      'exchangeId',
      'market',
      'axisValues',
      'normal',
      'probabilities',
      'modelVersion',
      'source',
    ] as const)('必須項目 %s を null にすると InvalidEntityDataError をスローする', (field) => {
      expect(() => mapper.toUpdateAttributes({ [field]: null }, KEY)).toThrow(
        InvalidEntityDataError
      );
    });

    it.each([
      ['tickerId', { tickerId: 'NSDQ:AAPL' }],
      ['date', { date: '2026-02-27' }],
      ['createdAt', { createdAt: TIMESTAMP }],
    ] as const)(
      '変更不可の項目 %s を含めると、値が同じでも InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes, KEY)).toThrow(InvalidEntityDataError);
      }
    );
  });

  describe('toEntity', () => {
    it('Item を camelCase の Entity に変換する', () => {
      expect(mapper.toEntity(buildItem())).toEqual(buildEntity());
    });

    it('PK/SK/Type/GSI4 などの保存用の属性を Entity に含めない', () => {
      const entity = mapper.toEntity(buildItem());

      for (const name of ['PK', 'SK', 'Type', 'GSI4PK', 'GSI4SK']) {
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

    it('Outcome に除外理由がある場合も保持される', () => {
      const excluded: ForecastOutcome = {
        nextDate: '2026-02-28',
        nextReturn: 0.5,
        nextRange: 0.02,
        hit: {},
        excludedReason: 'EXTREME_RETURN',
        evaluatedAt: 1_700_100_000_000,
      };

      expect(mapper.toEntity(buildItem({ Outcome: excluded })).outcome?.excludedReason).toBe(
        'EXTREME_RETURN'
      );
    });

    it.each(['AxisValues', 'Normal', 'Probabilities', 'BackfilledAxes', 'Outcome'])(
      '%s がオブジェクトでない場合は InvalidEntityDataError をスローする',
      (attribute) => {
        expect(() => mapper.toEntity(buildItem({ [attribute]: 'not-an-object' }))).toThrow(
          InvalidEntityDataError
        );
      }
    );

    it('必須フィールドが欠けている場合は InvalidEntityDataError をスローする', () => {
      const item = buildItem();
      delete item.TickerID;

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

    it('時刻が不正な形式のときは InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ CreatedAt: 'not-a-date' }))).toThrow(
        InvalidEntityDataError
      );
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
    it('フルアイテムから TickerSample を組み立てる', () => {
      const item = mapper.toItem(
        buildEntity({
          probabilities: {
            DIR: buildEntity().probabilities.DIR!,
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
          outcome: OUTCOME,
        })
      );

      expect(mapper.toSample(item)).toEqual({
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        market: 'US',
        date: '2026-02-27',
        axisValues: buildEntity().axisValues,
        normal: buildEntity().normal,
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

    it('除外理由のある Outcome は excludedReason を引き継ぐ', () => {
      const sample = mapper.toSample(
        buildItem({
          Outcome: {
            nextDate: '2026-02-28',
            nextReturn: 0.5,
            nextRange: 0.02,
            hit: {},
            excludedReason: 'EXTREME_RETURN',
            evaluatedAt: 1,
          },
        })
      );

      expect(sample.outcome).toEqual({
        nextDate: '2026-02-28',
        hit: {},
        excludedReason: 'EXTREME_RETURN',
      });
    });

    it('Outcome に hit が無くても、空の hit として読む', () => {
      const sample = mapper.toSample(
        buildItem({ Outcome: { nextDate: '2026-02-28', evaluatedAt: 1 } })
      );

      expect(sample.outcome).toEqual({ nextDate: '2026-02-28', hit: {} });
    });

    it('ProjectionExpression で一部属性が欠けていても動く (Normal・Outcome・Probabilities 省略)', () => {
      const sample = mapper.toSample({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Market: 'US',
        Date: '2026-02-27',
        AxisValues: buildEntity().axisValues,
      });

      expect(sample).toEqual({
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        market: 'US',
        date: '2026-02-27',
        axisValues: buildEntity().axisValues,
      });
    });

    it('Probabilities があっても DIR・VOL いずれも値が無ければ probabilities を省く', () => {
      expect(mapper.toSample(buildItem({ Probabilities: {} })).probabilities).toBeUndefined();
    });

    it('射影に含まれる属性だけで toSample が動く', () => {
      const entity = buildEntity({
        probabilities: { DIR: buildEntity().probabilities.DIR! },
        outcome: OUTCOME,
      });
      const item = mapper.toItem(entity);
      const projected: Record<string, unknown> = {};
      for (const [name, ...rest] of FORECAST_SAMPLE_ATTRIBUTE_PATHS) {
        if (rest.length === 0) {
          projected[name] = item[name];
        }
      }
      // ネストした確率は probability・baseline だけを残す
      projected.Probabilities = {
        DIR: { probability: 0.52, baseline: 0.5 },
      };

      expect(mapper.toSample(projected)).toEqual(mapper.toSample(item));
    });
  });

  describe('FORECAST_SAMPLE_ATTRIBUTE_PATHS', () => {
    it('toSample が読まない重い属性 (寄与・中立帯など) を含めない', () => {
      const names = FORECAST_SAMPLE_ATTRIBUTE_PATHS.flat();

      expect(names).not.toEqual(
        expect.arrayContaining(['contributions', 'neutralBand', 'bandHistory'])
      );
      expect(names).toEqual(
        expect.arrayContaining(['TickerID', 'Outcome', 'Probabilities', 'probability', 'baseline'])
      );
    });
  });

  describe('toOutcomeAttribute', () => {
    function buildOutcome(overrides: Partial<TickerOutcome> = {}): TickerOutcome {
      return {
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
        ...overrides,
      };
    }

    it('識別子フィールド (tickerId/exchangeId/market/date) を除いて変換する', () => {
      expect(mapper.toOutcomeAttribute(buildOutcome())).toEqual({
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
      const attribute = mapper.toOutcomeAttribute(
        buildOutcome({
          excessReturn: undefined,
          rangeRatio: undefined,
          hit: {},
          excludedReason: 'EXTREME_RETURN',
        })
      );

      expect(attribute).not.toHaveProperty('excessReturn');
      expect(attribute).not.toHaveProperty('rangeRatio');
      expect(attribute.excludedReason).toBe('EXTREME_RETURN');
    });
  });
});
