/**
 * PerformanceDailyRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に同一の仕様を通し、実装間の乖離を
 * 機械的に検知する。PerformanceDaily は日ごとに再計算して置き換えてよい（冪等な upsert）ため、
 * Forecast 系と異なり条件付き書き込みの契約は持たない。
 */
import type { PerformanceDailyRepository } from '../../src/repositories/performance-daily.repository.interface.js';
import type { PerformanceDailyItem } from '../../src/forecast/index.js';

export interface PerformanceDailyRepositoryContractHooks {
  makeRepository: () => Promise<PerformanceDailyRepository>;
  reset: () => Promise<void>;
  teardown?: () => Promise<void>;
}

function buildItem(overrides: Partial<PerformanceDailyItem> = {}): PerformanceDailyItem {
  return {
    question: 'VOL',
    market: 'US',
    date: '2026-02-27',
    evaluatedCount: 30,
    hitCount: 12,
    axisStats: { 'range-today': { count: 10, hitCount: 6 } },
    probabilityBands: [{ lower: 0.4, upper: 0.45, count: 5, hitCount: 2, sumProbability: 2.1 }],
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

export function definePerformanceDailyRepositoryContract(
  label: string,
  hooks: PerformanceDailyRepositoryContractHooks
): void {
  describe(`PerformanceDailyRepository 契約: ${label}`, () => {
    let repository: PerformanceDailyRepository;

    beforeEach(async () => {
      await hooks.reset();
      repository = await hooks.makeRepository();
    });

    afterAll(async () => {
      if (hooks.teardown) {
        await hooks.teardown();
      }
    });

    it('getByDate は未登録の PerformanceDaily に対して null を返す', async () => {
      expect(await repository.getByDate('VOL', 'US', '2026-02-27')).toBeNull();
    });

    it('save は新規保存し、getByDate で取得できる', async () => {
      const item = buildItem();
      const saved = await repository.save(item);
      expect(saved).toEqual(item);

      const fetched = await repository.getByDate('VOL', 'US', '2026-02-27');
      expect(fetched).toEqual(item);
    });

    it('save は既存の場合、無条件で置き換える（冪等な再計算）', async () => {
      await repository.save(buildItem({ evaluatedCount: 30, hitCount: 12 }));
      await repository.save(buildItem({ evaluatedCount: 45, hitCount: 20 }));

      const fetched = await repository.getByDate('VOL', 'US', '2026-02-27');
      expect(fetched?.evaluatedCount).toBe(45);
      expect(fetched?.hitCount).toBe(20);
    });

    it('getByPeriod は境界日を含み、問い・市場でパーティション分離される', async () => {
      await repository.save(buildItem({ date: '2026-02-01' }));
      await repository.save(buildItem({ date: '2026-02-27' }));
      await repository.save(buildItem({ date: '2026-03-01' }));
      await repository.save(buildItem({ question: 'DIR', date: '2026-02-15' }));
      await repository.save(buildItem({ market: 'JP', date: '2026-02-15' }));

      const result = await repository.getByPeriod('VOL', 'US', '2026-02-01', '2026-02-27');
      expect(result.map((i) => i.date)).toEqual(['2026-02-01', '2026-02-27']);
    });

    it('getByPeriod は toDate 省略時に fromDate 以降の全期間を返す', async () => {
      await repository.save(buildItem({ date: '2026-02-01' }));
      await repository.save(buildItem({ date: '2026-12-31' }));

      const result = await repository.getByPeriod('VOL', 'US', '2026-06-01');
      expect(result.map((i) => i.date)).toEqual(['2026-12-31']);
    });
  });
}
