/**
 * Stock Tracker Core - ModelSnapshot Mapper Unit Tests
 *
 * ModelSnapshotMapperのユニットテスト
 */
import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import {
  ModelSnapshotMapper,
  buildModelSnapshotPk,
  buildModelSnapshotSk,
} from '../../../src/mappers/model-snapshot.mapper.js';
import type { ModelSnapshotItem } from '../../../src/forecast/index.js';

const TIMESTAMP = 1_700_000_000_000;
const KEY = { question: 'DIR', market: 'US', date: '2026-02-27' } as const;

function buildEntity(overrides: Partial<ModelSnapshotItem> = {}): ModelSnapshotItem {
  return {
    question: 'DIR',
    market: 'US',
    date: '2026-02-27',
    modelVersion: 'forecast-core-v1',
    alpha: 80,
    weights: { 'pattern-1': 0.12 },
    standardization: { 'range-today': { mean: 0.03, std: 0.01 } },
    baseline: 0.5,
    neutralBand: { lower: -1, upper: 1, decidedOn: '2026-02-01' },
    bandHistory: [{ lower: 0.45, upper: 0.5, count: 40, hitRate: 0.5 }],
    axisStats: {
      'pattern-1': { count: 40, hitRate: 0.55, diffFromBaseline: 0.05, lowSample: false },
    },
    trainingSize: 3400,
    distinctTrainingDates: 100,
    createdAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const entity = buildEntity();
  return {
    PK: 'MODEL#DIR#US',
    SK: 'DATE#2026-02-27',
    Type: 'ModelSnapshot',
    Question: 'DIR',
    Market: 'US',
    Date: '2026-02-27',
    ModelVersion: 'forecast-core-v1',
    Alpha: 80,
    Weights: entity.weights,
    Standardization: entity.standardization,
    Baseline: 0.5,
    NeutralBand: entity.neutralBand,
    BandHistory: entity.bandHistory,
    AxisStats: entity.axisStats,
    TrainingSize: 3400,
    DistinctTrainingDates: 100,
    CreatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('ModelSnapshotMapper', () => {
  let mapper: ModelSnapshotMapper;

  beforeEach(() => {
    mapper = new ModelSnapshotMapper();
  });

  it('entityType は ModelSnapshot になる', () => {
    expect(mapper.entityType).toBe('ModelSnapshot');
  });

  describe('キーの組み立て', () => {
    it('ビジネスキーから PK/SK を構築する', () => {
      expect(mapper.buildKeys({ question: 'VOL', market: 'JP', date: '2026-03-01' })).toEqual({
        PK: 'MODEL#VOL#JP',
        SK: 'DATE#2026-03-01',
      });
    });

    it('PK が先頭のキー属性になる (条件付き書き込みの存在判定に使われる)', () => {
      expect(Object.keys(mapper.buildKeys(KEY))).toEqual(['PK', 'SK']);
    });

    it('Entity からビジネスキーを取り出す', () => {
      expect(mapper.getKey(buildEntity())).toEqual(KEY);
    });

    it('独自クエリ用に問い・市場から PK、日付から SK を構築する', () => {
      expect(buildModelSnapshotPk('VOL', 'JP')).toBe('MODEL#VOL#JP');
      expect(buildModelSnapshotSk('2026-02-27')).toBe('DATE#2026-02-27');
    });
  });

  describe('toItem', () => {
    it('Entity を保存形式 (PascalCase・キー・Type) の Item に変換する', () => {
      expect(mapper.toItem(buildEntity())).toEqual(buildItem());
    });

    it('更新日時は store が設定するため、Item に含めない', () => {
      expect(mapper.toItem(buildEntity())).not.toHaveProperty('UpdatedAt');
    });

    it('toItem のキー属性は buildKeys の結果と一致する', () => {
      const entity = buildEntity({ question: 'VOL', market: 'JP', date: '2026-03-02' });
      const item = mapper.toItem(entity);

      for (const [name, value] of Object.entries(mapper.buildKeys(mapper.getKey(entity)))) {
        expect(item[name]).toBe(value);
      }
    });
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目だけを保存用の属性名で返す (キーから作る属性はない)', () => {
      expect(mapper.toUpdateAttributes({ baseline: 0.6, trainingSize: 10 })).toEqual({
        Baseline: 0.6,
        TrainingSize: 10,
      });
    });

    it('undefined の項目は変更しない (属性に含めても値は undefined)', () => {
      const attributes = mapper.toUpdateAttributes({ alpha: undefined, baseline: 0.6 });

      expect(attributes.Alpha).toBeUndefined();
      expect(attributes.Baseline).toBe(0.6);
    });

    it.each([
      'modelVersion',
      'alpha',
      'weights',
      'standardization',
      'baseline',
      'neutralBand',
      'bandHistory',
      'axisStats',
      'trainingSize',
      'distinctTrainingDates',
    ] as const)('必須項目 %s を null にすると InvalidEntityDataError をスローする', (field) => {
      expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
    });

    it.each([
      ['question', { question: 'DIR' }],
      ['market', { market: 'US' }],
      ['date', { date: '2026-02-27' }],
      ['createdAt', { createdAt: TIMESTAMP }],
    ] as const)(
      '変更不可の項目 %s を含めると、値が同じでも InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes)).toThrow(InvalidEntityDataError);
      }
    );

    it('任意項目を持たないため、削除を表す値は返さない', () => {
      const attributes = mapper.toUpdateAttributes({ baseline: 0.6 });

      expect(Object.values(attributes)).not.toContain(REMOVE_ATTRIBUTE);
    });
  });

  describe('toEntity', () => {
    it('Item を camelCase の Entity に変換する', () => {
      expect(mapper.toEntity(buildItem())).toEqual(buildEntity());
    });

    it('PK/SK/Type などの保存用の属性を Entity に含めない', () => {
      const entity = mapper.toEntity(buildItem());

      for (const name of ['PK', 'SK', 'Type', 'UpdatedAt']) {
        expect(entity).not.toHaveProperty(name);
      }
    });

    it('UpdatedAt が旧形式でも読み取りに影響しない', () => {
      expect(mapper.toEntity(buildItem({ UpdatedAt: 'broken' }))).toEqual(buildEntity());
    });

    it.each(['Weights', 'Standardization', 'NeutralBand', 'AxisStats'])(
      '%s がオブジェクトでない場合は InvalidEntityDataError をスローする',
      (attribute) => {
        expect(() => mapper.toEntity(buildItem({ [attribute]: 'not-an-object' }))).toThrow(
          InvalidEntityDataError
        );
        expect(() => mapper.toEntity(buildItem({ [attribute]: [] }))).toThrow(
          InvalidEntityDataError
        );
      }
    );

    it('BandHistory が配列でない場合は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ BandHistory: {} }))).toThrow(InvalidEntityDataError);
    });

    it('Question が不正な場合は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ Question: 'UNKNOWN' }))).toThrow(
        InvalidEntityDataError
      );
    });

    it('必須フィールドが欠けている場合は InvalidEntityDataError をスローする', () => {
      const item = buildItem();
      delete item.Market;

      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });

    it('時刻が ISO 文字列で保存された旧形式のデータもミリ秒で読める', () => {
      const entity = mapper.toEntity(buildItem({ CreatedAt: new Date(TIMESTAMP).toISOString() }));

      expect(entity.createdAt).toBe(TIMESTAMP);
    });

    it('時刻がエポック秒で保存された旧形式のデータもミリ秒で読める', () => {
      const entity = mapper.toEntity(buildItem({ CreatedAt: TIMESTAMP / 1000 }));

      expect(entity.createdAt).toBe(TIMESTAMP);
    });
  });

  describe('変換の往復', () => {
    it('Entity -> Item -> Entity の変換で元に戻る', () => {
      const original = buildEntity();

      expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
    });
  });
});
