/**
 * Stock Tracker Core - InMemory ModelSnapshot Repository Unit Tests
 *
 * InMemoryModelSnapshotRepositoryのユニットテスト
 */
import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryModelSnapshotRepository } from '../../../src/repositories/in-memory-model-snapshot.repository.js';
import type { ModelSnapshotItem } from '../../../src/forecast/index.js';

function buildItem(overrides: Partial<ModelSnapshotItem> = {}): ModelSnapshotItem {
  return {
    question: 'DIR',
    market: 'US',
    date: '2026-02-27',
    modelVersion: 'forecast-core-v1',
    alpha: 80,
    weights: {},
    standardization: {},
    baseline: 0.5,
    neutralBand: { lower: -1, upper: 1, decidedOn: '2026-02-01' },
    bandHistory: [],
    axisStats: {},
    trainingSize: 100,
    distinctTrainingDates: 50,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('InMemoryModelSnapshotRepository', () => {
  let repository: InMemoryModelSnapshotRepository;

  beforeEach(() => {
    repository = new InMemoryModelSnapshotRepository(new InMemorySingleTableStore());
  });

  describe('createIfAbsent', () => {
    it('新規作成し、getByDate で取得できる', async () => {
      const result = await repository.createIfAbsent(buildItem());
      expect(result.created).toBe(true);

      const fetched = await repository.getByDate('DIR', 'US', '2026-02-27');
      expect(fetched).toEqual(result.item);
    });

    it('既に存在する場合は書き込まず created:false を返す', async () => {
      await repository.createIfAbsent(buildItem());
      const second = await repository.createIfAbsent(buildItem({ baseline: 0.9 }));

      expect(second.created).toBe(false);
      // 一度書いたら書き換えない（最初の値のまま）
      expect(second.item.baseline).toBe(0.5);
    });
  });

  describe('getByDate', () => {
    it('存在しない場合は null を返す', async () => {
      expect(await repository.getByDate('DIR', 'US', '2026-02-27')).toBeNull();
    });
  });

  describe('getLatestBefore', () => {
    it('指定日より前の最新のスナップショットを返す', async () => {
      await repository.createIfAbsent(buildItem({ date: '2026-02-01' }));
      await repository.createIfAbsent(buildItem({ date: '2026-02-15' }));
      await repository.createIfAbsent(buildItem({ date: '2026-02-27' }));

      const result = await repository.getLatestBefore('DIR', 'US', '2026-02-27');
      expect(result?.date).toBe('2026-02-15');
    });

    it('指定日以降のものは含めない（境界日そのものは対象外）', async () => {
      await repository.createIfAbsent(buildItem({ date: '2026-02-27' }));
      const result = await repository.getLatestBefore('DIR', 'US', '2026-02-27');
      expect(result).toBeNull();
    });

    it('他の問い・市場のスナップショットは含めない', async () => {
      await repository.createIfAbsent(buildItem({ question: 'VOL', date: '2026-02-01' }));
      await repository.createIfAbsent(buildItem({ market: 'JP', date: '2026-02-01' }));

      const result = await repository.getLatestBefore('DIR', 'US', '2026-02-27');
      expect(result).toBeNull();
    });

    it('該当が無い場合は null を返す', async () => {
      expect(await repository.getLatestBefore('DIR', 'US', '2026-02-27')).toBeNull();
    });
  });
});
