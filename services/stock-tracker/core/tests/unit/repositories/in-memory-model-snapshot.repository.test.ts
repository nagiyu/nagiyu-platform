/**
 * Stock Tracker Core - InMemory ModelSnapshot Repository Unit Tests
 *
 * InMemoryModelSnapshotRepositoryのユニットテスト
 *
 * 単一アイテムの作成・取得の振る舞い (エラー変換など) は EntityStore の責務のため、
 * ここでは createIfAbsent の「既存を返す」扱いと、直前のスナップショットを探すクエリだけを検証する。
 */
import {
  DatabaseError,
  InMemorySingleTableStore,
  InvalidEntityDataError,
  RepositoryError,
} from '@nagiyu/aws';
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
  let store: InMemorySingleTableStore;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryModelSnapshotRepository(store);
  });

  describe('createIfAbsent', () => {
    it('新規作成し、getByDate で取得できる', async () => {
      const result = await repository.createIfAbsent(buildItem());

      expect(result.created).toBe(true);
      expect(result.item).toEqual(buildItem());
      expect(await repository.getByDate('DIR', 'US', '2026-02-27')).toEqual(result.item);
    });

    it('既に存在する場合は書き込まず created:false を返す', async () => {
      await repository.createIfAbsent(buildItem());
      const second = await repository.createIfAbsent(buildItem({ baseline: 0.9 }));

      expect(second.created).toBe(false);
      // 一度書いたら書き換えない（最初の値のまま）
      expect(second.item.baseline).toBe(0.5);
    });

    it('既存が読めないときは InvalidEntityDataError をスローする', async () => {
      await repository.createIfAbsent(buildItem());
      const stored = store.get('MODEL#DIR#US', 'DATE#2026-02-27');
      store.put({ ...stored, Weights: 'broken' } as Parameters<typeof store.put>[0]);

      await expect(repository.createIfAbsent(buildItem())).rejects.toThrow(InvalidEntityDataError);
    });

    it('作成が衝突したのに既存が見つからないときは RepositoryError 派生の DatabaseError をスローする', async () => {
      await repository.createIfAbsent(buildItem());
      // create の存在確認では既存を返し、その後の get では見つからない状況を作る
      const existing = store.get('MODEL#DIR#US', 'DATE#2026-02-27');
      jest.spyOn(store, 'getByKey').mockReturnValueOnce(existing).mockReturnValueOnce(undefined);

      const promise = repository.createIfAbsent(buildItem());

      await expect(promise).rejects.toThrow(DatabaseError);
      await expect(promise).rejects.toBeInstanceOf(RepositoryError);
    });

    it('既存との衝突以外のエラーは、既存を探さずそのままスローする', async () => {
      jest.spyOn(store, 'putByKey').mockImplementation(() => {
        throw new Error('boom');
      });

      await expect(repository.createIfAbsent(buildItem())).rejects.toThrow('boom');
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

    it('store の 1 ページに収まらない件数があっても、最新を返す', async () => {
      for (let day = 0; day < 120; day += 1) {
        const date = new Date(Date.UTC(2025, 0, 1 + day)).toISOString().slice(0, 10);
        await repository.createIfAbsent(buildItem({ date }));
      }

      const result = await repository.getLatestBefore('DIR', 'US', '2026-01-01');

      expect(result?.date).toBe('2025-04-30');
    });

    it('最新のアイテムが読めないときは InvalidEntityDataError をスローする', async () => {
      await repository.createIfAbsent(buildItem({ date: '2026-02-15' }));
      const stored = store.get('MODEL#DIR#US', 'DATE#2026-02-15');
      store.put({ ...stored, Weights: 'broken' } as Parameters<typeof store.put>[0]);

      await expect(repository.getLatestBefore('DIR', 'US', '2026-02-27')).rejects.toThrow(
        InvalidEntityDataError
      );
    });
  });
});
