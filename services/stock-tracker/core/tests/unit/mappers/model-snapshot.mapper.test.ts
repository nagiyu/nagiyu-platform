/**
 * Stock Tracker Core - ModelSnapshot Mapper Unit Tests
 *
 * ModelSnapshotMapperのユニットテスト
 */
import { InvalidEntityDataError, type DynamoDBItem } from '@nagiyu/aws';
import { ModelSnapshotMapper } from '../../../src/mappers/model-snapshot.mapper.js';
import type { ModelSnapshotItem } from '../../../src/forecast/index.js';

describe('ModelSnapshotMapper', () => {
  let mapper: ModelSnapshotMapper;

  const item: ModelSnapshotItem = {
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
    createdAt: 1_700_000_000_000,
  };

  beforeEach(() => {
    mapper = new ModelSnapshotMapper();
  });

  describe('toItem / toEntity', () => {
    it('PK/SK を正しく組み立てる（camelCase → PascalCase）', () => {
      const dbItem = mapper.toItem(item);
      expect(dbItem.PK).toBe('MODEL#DIR#US');
      expect(dbItem.SK).toBe('DATE#2026-02-27');
      expect(dbItem.Type).toBe('ModelSnapshot');
      expect(dbItem.Question).toBe('DIR');
      expect(dbItem.TrainingSize).toBe(3400);
    });

    it('往復変換で元の値と一致する', () => {
      const restored = mapper.toEntity(mapper.toItem(item));
      expect(restored).toEqual(item);
    });

    it('Question が不正な場合は InvalidEntityDataError を投げる', () => {
      const dbItem = mapper.toItem(item);
      const broken = { ...dbItem, Question: 'UNKNOWN' } as unknown as DynamoDBItem;
      expect(() => mapper.toEntity(broken)).toThrow(InvalidEntityDataError);
    });

    it('BandHistory が配列でない場合は InvalidEntityDataError を投げる', () => {
      const dbItem = mapper.toItem(item);
      const broken = { ...dbItem, BandHistory: {} } as unknown as DynamoDBItem;
      expect(() => mapper.toEntity(broken)).toThrow(InvalidEntityDataError);
    });

    it('Weights がオブジェクトでない場合は InvalidEntityDataError を投げる', () => {
      const dbItem = mapper.toItem(item);
      const broken = { ...dbItem, Weights: 'not-an-object' } as unknown as DynamoDBItem;
      expect(() => mapper.toEntity(broken)).toThrow(InvalidEntityDataError);
    });
  });

  describe('buildKeys', () => {
    it('問い・市場・日付から PK/SK を構築する', () => {
      expect(mapper.buildKeys({ question: 'VOL', market: 'JP', date: '2026-03-01' })).toEqual({
        pk: 'MODEL#VOL#JP',
        sk: 'DATE#2026-03-01',
      });
    });
  });
});
