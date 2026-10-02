/**
 * Stock Tracker Core - InMemory PerformanceDaily Repository Unit Tests
 *
 * InMemoryPerformanceDailyRepositoryのユニットテスト
 */
import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryPerformanceDailyRepository } from '../../../src/repositories/in-memory-performance-daily.repository.js';
import type { PerformanceDailyItem } from '../../../src/forecast/index.js';

function buildItem(overrides: Partial<PerformanceDailyItem> = {}): PerformanceDailyItem {
  return {
    question: 'VOL',
    market: 'US',
    date: '2026-02-27',
    evaluatedCount: 30,
    hitCount: 12,
    axisStats: {},
    probabilityBands: [],
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('InMemoryPerformanceDailyRepository', () => {
  let repository: InMemoryPerformanceDailyRepository;

  beforeEach(() => {
    repository = new InMemoryPerformanceDailyRepository(new InMemorySingleTableStore());
  });

  describe('save', () => {
    it('新規保存し、getByDate で取得できる', async () => {
      await repository.save(buildItem());
      const fetched = await repository.getByDate('VOL', 'US', '2026-02-27');
      expect(fetched?.evaluatedCount).toBe(30);
    });

    it('既存の場合は無条件で置き換える（冪等な再計算）', async () => {
      await repository.save(buildItem({ evaluatedCount: 30, hitCount: 12 }));
      await repository.save(buildItem({ evaluatedCount: 45, hitCount: 20 }));

      const fetched = await repository.getByDate('VOL', 'US', '2026-02-27');
      expect(fetched?.evaluatedCount).toBe(45);
      expect(fetched?.hitCount).toBe(20);
    });
  });

  describe('getByDate', () => {
    it('存在しない場合は null を返す', async () => {
      expect(await repository.getByDate('VOL', 'US', '2026-02-27')).toBeNull();
    });
  });

  describe('getByPeriod', () => {
    it('期間内の PerformanceDaily を Date 昇順で返す', async () => {
      await repository.save(buildItem({ date: '2026-02-01' }));
      await repository.save(buildItem({ date: '2026-02-15' }));
      await repository.save(buildItem({ date: '2026-03-01' }));
      await repository.save(buildItem({ question: 'DIR', date: '2026-02-15' }));

      const result = await repository.getByPeriod('VOL', 'US', '2026-02-01', '2026-02-28');
      expect(result.map((i) => i.date)).toEqual(['2026-02-01', '2026-02-15']);
    });

    it('toDate 省略時は fromDate 以降の全期間を返す', async () => {
      await repository.save(buildItem({ date: '2026-02-01' }));
      await repository.save(buildItem({ date: '2026-06-01' }));

      const result = await repository.getByPeriod('VOL', 'US', '2026-03-01');
      expect(result.map((i) => i.date)).toEqual(['2026-06-01']);
    });
  });
});
