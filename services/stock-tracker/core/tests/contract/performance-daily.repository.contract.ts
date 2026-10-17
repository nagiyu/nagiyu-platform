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
  /** 保存形式を直接指定して Item を書き込む (旧形式や壊れたデータを再現するために使う) */
  putRawItem: (item: Record<string, unknown>) => Promise<void>;
  /** 保存されている Item を保存形式のまま読む */
  getRawItem: (pk: string, sk: string) => Promise<Record<string, unknown> | undefined>;
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

/** 保存形式 (PascalCase の属性名・キー) の Item。時刻は呼び出し側が指定する */
function buildRawItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const item = buildItem();
  return {
    PK: 'PERF#VOL#US',
    SK: 'DATE#2026-02-27',
    Type: 'PerformanceDaily',
    Question: 'VOL',
    Market: 'US',
    Date: '2026-02-27',
    EvaluatedCount: item.evaluatedCount,
    HitCount: item.hitCount,
    AxisStats: item.axisStats,
    ProbabilityBands: item.probabilityBands,
    CreatedAt: item.createdAt,
    UpdatedAt: item.createdAt,
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

    it('保存形式 (PascalCase の属性名・キー・数値ミリ秒の時刻) で書き込む', async () => {
      const item = buildItem();
      await repository.save(item);

      const raw = await hooks.getRawItem('PERF#VOL#US', 'DATE#2026-02-27');
      // UpdatedAt は書き込み時刻が入るため、値は固定せず数値であることだけを確かめる
      expect(raw).toEqual(buildRawItem({ UpdatedAt: expect.any(Number) }));
      expect(raw?.CreatedAt).toBe(item.createdAt);
    });

    it('save は保存のたびに更新日時を進め、作成日時は渡した値のまま書く', async () => {
      await repository.save(buildItem({ createdAt: 1_700_000_000_000 }));
      const first = await hooks.getRawItem('PERF#VOL#US', 'DATE#2026-02-27');
      await new Promise((resolve) => setTimeout(resolve, 5));

      await repository.save(buildItem({ createdAt: 1_700_000_500_000 }));

      const second = await hooks.getRawItem('PERF#VOL#US', 'DATE#2026-02-27');
      expect(second?.UpdatedAt as number).toBeGreaterThan(first?.UpdatedAt as number);
      expect(second?.CreatedAt).toBe(1_700_000_500_000);
    });

    describe('旧形式のデータ', () => {
      const LEGACY_TIME = '2026-02-27T10:00:00.000Z';

      it('時刻が ISO 文字列の PerformanceDaily も、ミリ秒で読める', async () => {
        await hooks.putRawItem(buildRawItem({ CreatedAt: LEGACY_TIME, UpdatedAt: LEGACY_TIME }));

        const fetched = await repository.getByDate('VOL', 'US', '2026-02-27');

        expect(fetched?.createdAt).toBe(Date.parse(LEGACY_TIME));
      });

      it('getByPeriod でも読める', async () => {
        await hooks.putRawItem(buildRawItem({ CreatedAt: LEGACY_TIME, UpdatedAt: LEGACY_TIME }));

        const result = await repository.getByPeriod('VOL', 'US', '2026-02-01');

        expect(result.map((i) => i.createdAt)).toEqual([Date.parse(LEGACY_TIME)]);
      });

      it('save は旧形式の Item を新形式で置き換える', async () => {
        await hooks.putRawItem(buildRawItem({ CreatedAt: LEGACY_TIME, UpdatedAt: LEGACY_TIME }));

        await repository.save(buildItem());

        const raw = await hooks.getRawItem('PERF#VOL#US', 'DATE#2026-02-27');
        expect(raw?.CreatedAt).toBe(1_700_000_000_000);
        expect(typeof raw?.UpdatedAt).toBe('number');
      });
    });

    describe('読めない PerformanceDaily', () => {
      async function putBrokenItem(): Promise<void> {
        await hooks.putRawItem(buildRawItem({ ProbabilityBands: 'broken' }));
      }

      it.each([
        [
          'getByDate',
          (repo: PerformanceDailyRepository) => repo.getByDate('VOL', 'US', '2026-02-27'),
        ],
        [
          'getByPeriod',
          (repo: PerformanceDailyRepository) => repo.getByPeriod('VOL', 'US', '2026-02-01'),
        ],
      ])('%s は、読み飛ばさず InvalidEntityDataError をスローする', async (_label, query) => {
        await putBrokenItem();

        await expect(query(repository)).rejects.toThrow(
          expect.objectContaining({ name: 'InvalidEntityDataError' })
        );
      });

      it('save は読めない Item も無条件で置き換える', async () => {
        await putBrokenItem();

        await repository.save(buildItem());

        expect(await repository.getByDate('VOL', 'US', '2026-02-27')).toEqual(buildItem());
      });
    });
  });
}
