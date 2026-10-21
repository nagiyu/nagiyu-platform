/**
 * Stock Tracker Core - InMemory PerformanceDaily Repository Unit Tests
 *
 * InMemoryPerformanceDailyRepositoryのユニットテスト
 *
 * 単一アイテムの保存・取得の振る舞い (エラー変換など) は EntityStore の責務のため、
 * ここでは save の置き換えと、期間のクエリだけを検証する。
 */
import { InMemorySingleTableStore, InvalidEntityDataError } from '@nagiyu/aws';
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
  let store: InMemorySingleTableStore;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryPerformanceDailyRepository(store);
  });

  describe('save', () => {
    it('新規保存し、保存した値を返す。getByDate で取得できる', async () => {
      const saved = await repository.save(buildItem());

      expect(saved).toEqual(buildItem());
      expect(await repository.getByDate('VOL', 'US', '2026-02-27')).toEqual(buildItem());
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
      await repository.save(buildItem({ date: '2026-02-15' }));
      await repository.save(buildItem({ date: '2026-02-01' }));
      await repository.save(buildItem({ date: '2026-03-01' }));
      await repository.save(buildItem({ question: 'DIR', date: '2026-02-15' }));
      await repository.save(buildItem({ market: 'JP', date: '2026-02-15' }));

      const result = await repository.getByPeriod('VOL', 'US', '2026-02-01', '2026-02-28');
      expect(result.map((i) => i.date)).toEqual(['2026-02-01', '2026-02-15']);
    });

    it('toDate の日付のアイテムを含む', async () => {
      await repository.save(buildItem({ date: '2026-02-28' }));

      const result = await repository.getByPeriod('VOL', 'US', '2026-02-01', '2026-02-28');

      expect(result.map((i) => i.date)).toEqual(['2026-02-28']);
    });

    it('toDate 省略時は fromDate 以降の全期間を返す', async () => {
      await repository.save(buildItem({ date: '2026-02-01' }));
      await repository.save(buildItem({ date: '2026-06-01' }));

      const result = await repository.getByPeriod('VOL', 'US', '2026-03-01');
      expect(result.map((i) => i.date)).toEqual(['2026-06-01']);
    });

    it('store の 1 ページに収まらない件数でも、全件を返す', async () => {
      for (let day = 0; day < 120; day += 1) {
        const date = new Date(Date.UTC(2025, 0, 1 + day)).toISOString().slice(0, 10);
        await repository.save(buildItem({ date }));
      }

      expect(await repository.getByPeriod('VOL', 'US', '2025-01-01')).toHaveLength(120);
    });

    it('読めないアイテムが含まれるときは InvalidEntityDataError をスローする', async () => {
      await repository.save(buildItem({ date: '2026-02-01' }));
      await repository.save(buildItem({ date: '2026-02-15' }));
      const stored = store.get('PERF#VOL#US', 'DATE#2026-02-15');
      store.put({ ...stored, ProbabilityBands: 'broken' } as Parameters<typeof store.put>[0]);

      await expect(repository.getByPeriod('VOL', 'US', '2026-02-01')).rejects.toThrow(
        InvalidEntityDataError
      );
    });
  });
});
