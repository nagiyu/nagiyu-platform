/**
 * Stock Tracker Core - InMemory MarketForecast Repository Unit Tests
 *
 * InMemoryMarketForecastRepositoryのユニットテスト
 *
 * 単一アイテムの作成・取得の振る舞い (エラー変換など) は EntityStore の責務のため、
 * ここでは createIfAbsent の「既存を返す」扱い、Outcome の追記、市場の期間クエリだけを検証する。
 */
import {
  DatabaseError,
  EntityNotFoundError,
  InMemorySingleTableStore,
  RepositoryError,
} from '@nagiyu/aws';
import { InMemoryMarketForecastRepository } from '../../../src/repositories/in-memory-market-forecast.repository.js';
import type { CreateMarketForecastInput } from '../../../src/entities/market-forecast.entity.js';
import type { MarketOutcome } from '../../../src/forecast/index.js';

function buildInput(overrides: Partial<CreateMarketForecastInput> = {}): CreateMarketForecastInput {
  return {
    market: 'US',
    date: '2026-02-27',
    axisValues: { 'market-range-avg': 0.1 },
    probabilities: {},
    modelVersion: 'forecast-core-v1',
    source: 'LIVE',
    ...overrides,
  };
}

describe('InMemoryMarketForecastRepository', () => {
  let repository: InMemoryMarketForecastRepository;
  let store: InMemorySingleTableStore;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryMarketForecastRepository(store);
  });

  describe('createIfAbsent', () => {
    it('新規作成し、getByMarketAndDate で取得できる', async () => {
      const result = await repository.createIfAbsent(buildInput());

      expect(result.created).toBe(true);
      expect(await repository.getByMarketAndDate('US', '2026-02-27')).toEqual(result.item);
    });

    it('既に存在する場合は書き込まず created:false を返す', async () => {
      const first = await repository.createIfAbsent(buildInput());
      const second = await repository.createIfAbsent(buildInput({ axisValues: { changed: 999 } }));

      expect(second.created).toBe(false);
      expect(second.item.axisValues).toEqual({ 'market-range-avg': 0.1 });
      expect(second.item).toEqual(first.item);
    });

    it('作成が衝突したのに既存が見つからないときは RepositoryError 派生の DatabaseError をスローする', async () => {
      await repository.createIfAbsent(buildInput());
      // create の存在確認では既存を返し、その後の get では見つからない状況を作る
      const existing = store.get('MARKETFORECAST#US', 'DATE#2026-02-27');
      jest.spyOn(store, 'getByKey').mockReturnValueOnce(existing).mockReturnValueOnce(undefined);

      const promise = repository.createIfAbsent(buildInput());

      await expect(promise).rejects.toThrow(DatabaseError);
      await expect(promise).rejects.toBeInstanceOf(RepositoryError);
    });
  });

  describe('createIfAbsent の書き込みエラー', () => {
    it('既存との衝突以外のエラーは、既存を探さずそのままスローする', async () => {
      jest.spyOn(store, 'putByKey').mockImplementation(() => {
        throw new Error('boom');
      });

      await expect(repository.createIfAbsent(buildInput())).rejects.toThrow('boom');
    });
  });

  describe('appendOutcome', () => {
    const KEY = { market: 'US', date: '2026-02-27' } as const;
    const outcome: MarketOutcome = {
      market: 'US',
      date: '2026-02-27',
      nextDate: '2026-02-28',
      nextRange: 0.09,
      hit: { MKT: true },
      evaluatedAt: 1_700_100_000_000,
    };

    it('既存 MarketForecast に Outcome（識別子を除いた形）を追記し、updatedAt を進める', async () => {
      const created = await repository.createIfAbsent(buildInput());
      await new Promise((resolve) => setTimeout(resolve, 5));

      const result = await repository.appendOutcome(KEY, outcome);

      expect(result.updated).toBe(true);
      expect(result.item.outcome).toEqual({
        nextDate: '2026-02-28',
        nextRange: 0.09,
        hit: { MKT: true },
        evaluatedAt: 1_700_100_000_000,
      });
      expect(result.item.updatedAt).toBeGreaterThan(created.item.updatedAt);
      expect(await repository.getByMarketAndDate('US', '2026-02-27')).toEqual(result.item);
    });

    it('予測部分は変更しない', async () => {
      const created = await repository.createIfAbsent(buildInput());

      const result = await repository.appendOutcome(KEY, outcome);

      expect({ ...result.item, outcome: undefined, updatedAt: 0 }).toEqual({
        ...created.item,
        outcome: undefined,
        updatedAt: 0,
      });
    });

    it('既に Outcome がある場合は上書きせず updated:false を返す', async () => {
      await repository.createIfAbsent(buildInput());
      await repository.appendOutcome(KEY, outcome);

      const second = await repository.appendOutcome(KEY, { ...outcome, hit: { MKT: false } });

      expect(second.updated).toBe(false);
      expect(second.item.outcome?.hit.MKT).toBe(true);
    });

    it('対象が存在しない場合は EntityNotFoundError をスローする', async () => {
      await expect(
        repository.appendOutcome({ market: 'JP', date: '2026-02-27' }, outcome)
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });
  });

  describe('getSamplesByDateRange', () => {
    it('期間内のサンプルを Date 順に返す', async () => {
      await repository.createIfAbsent(buildInput({ date: '2026-02-15' }));
      await repository.createIfAbsent(buildInput({ date: '2026-02-01' }));
      await repository.createIfAbsent(buildInput({ date: '2026-03-01' }));
      await repository.createIfAbsent(buildInput({ market: 'JP', date: '2026-02-15' }));

      const result = await repository.getSamplesByDateRange('US', '2026-02-01', '2026-02-28');

      expect(result.map((s) => s.date)).toEqual(['2026-02-01', '2026-02-15']);
    });

    it('toDate の日付のサンプルを含む', async () => {
      await repository.createIfAbsent(buildInput({ date: '2026-02-28' }));

      const result = await repository.getSamplesByDateRange('US', '2026-02-28', '2026-02-28');

      expect(result.map((s) => s.date)).toEqual(['2026-02-28']);
    });

    it('fromDate・toDate を省略すると全期間を返す', async () => {
      await repository.createIfAbsent(buildInput({ date: '2026-01-01' }));
      await repository.createIfAbsent(buildInput({ date: '2026-12-31' }));

      expect(await repository.getSamplesByDateRange('US')).toHaveLength(2);
    });

    it('fromDate のみ指定すると、それ以降を返す', async () => {
      await repository.createIfAbsent(buildInput({ date: '2026-01-01' }));
      await repository.createIfAbsent(buildInput({ date: '2026-06-01' }));

      const result = await repository.getSamplesByDateRange('US', '2026-03-01');

      expect(result.map((s) => s.date)).toEqual(['2026-06-01']);
    });

    it('toDate のみ指定すると、それ以前を返す', async () => {
      await repository.createIfAbsent(buildInput({ date: '2026-01-01' }));
      await repository.createIfAbsent(buildInput({ date: '2026-06-01' }));

      const result = await repository.getSamplesByDateRange('US', undefined, '2026-03-01');

      expect(result.map((s) => s.date)).toEqual(['2026-01-01']);
    });
  });
});
