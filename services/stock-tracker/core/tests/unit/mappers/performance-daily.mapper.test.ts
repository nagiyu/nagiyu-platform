/**
 * Stock Tracker Core - PerformanceDaily Mapper Unit Tests
 *
 * PerformanceDailyMapperのユニットテスト
 */
import { InvalidEntityDataError, type DynamoDBItem } from '@nagiyu/aws';
import { PerformanceDailyMapper } from '../../../src/mappers/performance-daily.mapper.js';
import type { PerformanceDailyItem } from '../../../src/forecast/index.js';

describe('PerformanceDailyMapper', () => {
  let mapper: PerformanceDailyMapper;

  const item: PerformanceDailyItem = {
    question: 'VOL',
    market: 'US',
    date: '2026-02-27',
    evaluatedCount: 30,
    hitCount: 12,
    axisStats: {
      'range-today': { count: 10, hitCount: 6 },
    },
    probabilityBands: [{ lower: 0.4, upper: 0.45, count: 5, hitCount: 2, sumProbability: 2.1 }],
    createdAt: 1_700_000_000_000,
  };

  beforeEach(() => {
    mapper = new PerformanceDailyMapper();
  });

  describe('toItem / toEntity', () => {
    it('PK/SK を正しく組み立てる', () => {
      const dbItem = mapper.toItem(item);
      expect(dbItem.PK).toBe('PERF#VOL#US');
      expect(dbItem.SK).toBe('DATE#2026-02-27');
      expect(dbItem.Type).toBe('PerformanceDaily');
      expect(dbItem.EvaluatedCount).toBe(30);
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

    it('ProbabilityBands が配列でない場合は InvalidEntityDataError を投げる', () => {
      const dbItem = mapper.toItem(item);
      const broken = { ...dbItem, ProbabilityBands: {} } as unknown as DynamoDBItem;
      expect(() => mapper.toEntity(broken)).toThrow(InvalidEntityDataError);
    });

    it('AxisStats がオブジェクトでない場合は InvalidEntityDataError を投げる', () => {
      const dbItem = mapper.toItem(item);
      const broken = { ...dbItem, AxisStats: [] } as unknown as DynamoDBItem;
      expect(() => mapper.toEntity(broken)).toThrow(InvalidEntityDataError);
    });
  });

  describe('buildKeys', () => {
    it('問い・市場・日付から PK/SK を構築する', () => {
      expect(mapper.buildKeys({ question: 'MKT', market: 'JP', date: '2026-03-01' })).toEqual({
        pk: 'PERF#MKT#JP',
        sk: 'DATE#2026-03-01',
      });
    });
  });
});
