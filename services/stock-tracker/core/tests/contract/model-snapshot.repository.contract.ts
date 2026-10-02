/**
 * ModelSnapshotRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に同一の仕様を通し、実装間の乖離
 * （条件付き書き込みの意味論・日付の大小比較など）を機械的に検知する。
 */
import type { ModelSnapshotRepository } from '../../src/repositories/model-snapshot.repository.interface.js';
import type { ModelSnapshotItem } from '../../src/forecast/index.js';

export interface ModelSnapshotRepositoryContractHooks {
  makeRepository: () => Promise<ModelSnapshotRepository>;
  reset: () => Promise<void>;
  teardown?: () => Promise<void>;
}

function buildItem(overrides: Partial<ModelSnapshotItem> = {}): ModelSnapshotItem {
  return {
    question: 'DIR',
    market: 'US',
    date: '2026-02-27',
    modelVersion: 'forecast-core-v1',
    alpha: 80,
    weights: { 'buy-count-ge2': 0.1 },
    standardization: {},
    baseline: 0.5,
    neutralBand: { lower: -1, upper: 1, decidedOn: '2026-02-01' },
    bandHistory: [{ lower: 0.45, upper: 0.5, count: 40, hitRate: 0.5 }],
    axisStats: {},
    trainingSize: 3400,
    distinctTrainingDates: 100,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

export function defineModelSnapshotRepositoryContract(
  label: string,
  hooks: ModelSnapshotRepositoryContractHooks
): void {
  describe(`ModelSnapshotRepository 契約: ${label}`, () => {
    let repository: ModelSnapshotRepository;

    beforeEach(async () => {
      await hooks.reset();
      repository = await hooks.makeRepository();
    });

    afterAll(async () => {
      if (hooks.teardown) {
        await hooks.teardown();
      }
    });

    it('getByDate は未登録の ModelSnapshot に対して null を返す', async () => {
      expect(await repository.getByDate('DIR', 'US', '2026-02-27')).toBeNull();
    });

    it('createIfAbsent は新規作成し、getByDate で取得できる', async () => {
      const item = buildItem();
      const result = await repository.createIfAbsent(item);

      expect(result.created).toBe(true);
      expect(result.item).toEqual(item);

      const fetched = await repository.getByDate('DIR', 'US', '2026-02-27');
      expect(fetched).toEqual(item);
    });

    it('createIfAbsent は既に存在する場合、書き込まず既存の値を created:false で返す（一度書いたら書き換えない）', async () => {
      await repository.createIfAbsent(buildItem({ baseline: 0.5 }));
      const second = await repository.createIfAbsent(buildItem({ baseline: 0.9 }));

      expect(second.created).toBe(false);
      expect(second.item.baseline).toBe(0.5);

      const fetched = await repository.getByDate('DIR', 'US', '2026-02-27');
      expect(fetched?.baseline).toBe(0.5);
    });

    it('getLatestBefore は指定日より前の最新のスナップショットを返す', async () => {
      await repository.createIfAbsent(buildItem({ date: '2026-02-01' }));
      await repository.createIfAbsent(buildItem({ date: '2026-02-15' }));
      await repository.createIfAbsent(buildItem({ date: '2026-02-27' }));

      const result = await repository.getLatestBefore('DIR', 'US', '2026-02-27');
      expect(result?.date).toBe('2026-02-15');
    });

    it('getLatestBefore は境界日そのもの（date と同日）を含めない', async () => {
      await repository.createIfAbsent(buildItem({ date: '2026-02-27' }));
      expect(await repository.getLatestBefore('DIR', 'US', '2026-02-27')).toBeNull();
    });

    it('getLatestBefore は他の問い・市場のスナップショットを含めない', async () => {
      await repository.createIfAbsent(buildItem({ question: 'VOL', date: '2026-02-01' }));
      await repository.createIfAbsent(buildItem({ market: 'JP', date: '2026-02-01' }));

      expect(await repository.getLatestBefore('DIR', 'US', '2026-02-27')).toBeNull();
    });
  });
}
