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
  /** 保存形式を直接指定して Item を書き込む (旧形式や壊れたデータを再現するために使う) */
  putRawItem: (item: Record<string, unknown>) => Promise<void>;
  /** 保存されている Item を保存形式のまま読む */
  getRawItem: (pk: string, sk: string) => Promise<Record<string, unknown> | undefined>;
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

/** 保存形式 (PascalCase の属性名・キー) の Item。時刻は呼び出し側が指定する */
function buildRawItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const item = buildItem();
  return {
    PK: 'MODEL#DIR#US',
    SK: 'DATE#2026-02-27',
    Type: 'ModelSnapshot',
    Question: 'DIR',
    Market: 'US',
    Date: '2026-02-27',
    ModelVersion: item.modelVersion,
    Alpha: item.alpha,
    Weights: item.weights,
    Standardization: item.standardization,
    Baseline: item.baseline,
    NeutralBand: item.neutralBand,
    BandHistory: item.bandHistory,
    AxisStats: item.axisStats,
    TrainingSize: item.trainingSize,
    DistinctTrainingDates: item.distinctTrainingDates,
    CreatedAt: item.createdAt,
    UpdatedAt: item.createdAt,
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

    it('保存形式 (PascalCase の属性名・キー・数値ミリ秒の時刻) で書き込む', async () => {
      const item = buildItem();
      await repository.createIfAbsent(item);

      const raw = await hooks.getRawItem('MODEL#DIR#US', 'DATE#2026-02-27');
      // UpdatedAt は書き込み時刻が入るため、値は固定せず数値であることだけを確かめる
      expect(raw).toEqual(buildRawItem({ UpdatedAt: expect.any(Number) }));
      expect(raw?.CreatedAt).toBe(item.createdAt);
    });

    it('createIfAbsent で既存があっても、保存済みの Item を書き換えない', async () => {
      await repository.createIfAbsent(buildItem({ baseline: 0.5 }));
      const before = await hooks.getRawItem('MODEL#DIR#US', 'DATE#2026-02-27');
      await new Promise((resolve) => setTimeout(resolve, 5));

      await repository.createIfAbsent(buildItem({ baseline: 0.9 }));

      expect(await hooks.getRawItem('MODEL#DIR#US', 'DATE#2026-02-27')).toEqual(before);
    });

    describe('旧形式のデータ', () => {
      const LEGACY_TIME = '2026-02-27T10:00:00.000Z';

      it('時刻が ISO 文字列の ModelSnapshot も、ミリ秒で読める', async () => {
        await hooks.putRawItem(buildRawItem({ CreatedAt: LEGACY_TIME, UpdatedAt: LEGACY_TIME }));

        const fetched = await repository.getByDate('DIR', 'US', '2026-02-27');

        expect(fetched?.createdAt).toBe(Date.parse(LEGACY_TIME));
      });

      it('getLatestBefore でも読める', async () => {
        await hooks.putRawItem(buildRawItem({ CreatedAt: LEGACY_TIME, UpdatedAt: LEGACY_TIME }));

        const result = await repository.getLatestBefore('DIR', 'US', '2026-03-01');

        expect(result?.createdAt).toBe(Date.parse(LEGACY_TIME));
      });

      it('createIfAbsent は旧形式の既存を書き換えず、ミリ秒に直して created:false で返す', async () => {
        await hooks.putRawItem(buildRawItem({ CreatedAt: LEGACY_TIME, UpdatedAt: LEGACY_TIME }));

        const result = await repository.createIfAbsent(buildItem({ baseline: 0.9 }));

        expect(result.created).toBe(false);
        expect(result.item.createdAt).toBe(Date.parse(LEGACY_TIME));
        const raw = await hooks.getRawItem('MODEL#DIR#US', 'DATE#2026-02-27');
        expect(raw?.CreatedAt).toBe(LEGACY_TIME);
      });
    });

    describe('読めない ModelSnapshot', () => {
      async function putBrokenItem(date: string): Promise<void> {
        await hooks.putRawItem(buildRawItem({ SK: `DATE#${date}`, Date: date, Weights: 'broken' }));
      }

      it.each([
        ['getByDate', (repo: ModelSnapshotRepository) => repo.getByDate('DIR', 'US', '2026-02-27')],
        [
          'getLatestBefore',
          (repo: ModelSnapshotRepository) => repo.getLatestBefore('DIR', 'US', '2026-03-01'),
        ],
        [
          'createIfAbsent（既存が読めない）',
          (repo: ModelSnapshotRepository) => repo.createIfAbsent(buildItem()),
        ],
      ])('%s は、読み飛ばさず InvalidEntityDataError をスローする', async (_label, query) => {
        await putBrokenItem('2026-02-27');

        await expect(query(repository)).rejects.toThrow(
          expect.objectContaining({ name: 'InvalidEntityDataError' })
        );
      });

      it('getLatestBefore は最新でない読めないアイテムを読まない', async () => {
        await putBrokenItem('2026-02-01');
        await repository.createIfAbsent(buildItem({ date: '2026-02-15' }));

        const result = await repository.getLatestBefore('DIR', 'US', '2026-02-27');

        expect(result?.date).toBe('2026-02-15');
      });
    });
  });
}
