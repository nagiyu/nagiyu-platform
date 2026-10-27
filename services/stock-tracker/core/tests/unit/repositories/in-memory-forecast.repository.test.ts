/**
 * Stock Tracker Core - InMemory Forecast Repository Unit Tests
 *
 * InMemoryForecastRepositoryのユニットテスト
 *
 * 単一アイテムの作成・取得の振る舞い (エラー変換など) は EntityStore の責務のため、
 * ここでは createIfAbsent の「既存を返す」扱い、Outcome の追記、GSI4 の近似クエリだけを検証する。
 */
import {
  DatabaseError,
  EntityNotFoundError,
  InMemorySingleTableStore,
  InvalidEntityDataError,
  RepositoryError,
} from '@nagiyu/aws';
import { InMemoryDailySummaryRepository } from '../../../src/repositories/in-memory-daily-summary.repository.js';
import { InMemoryForecastRepository } from '../../../src/repositories/in-memory-forecast.repository.js';
import type { CreateForecastInput } from '../../../src/entities/forecast.entity.js';
import type { TickerOutcome } from '../../../src/forecast/index.js';

function buildInput(overrides: Partial<CreateForecastInput> = {}): CreateForecastInput {
  return {
    tickerId: 'NSDQ:AAPL',
    exchangeId: 'NASDAQ',
    market: 'US',
    date: '2026-02-27',
    axisValues: { 'buy-count-ge2': true },
    normal: { range: 0.03 },
    probabilities: {},
    modelVersion: 'forecast-core-v1',
    source: 'LIVE',
    ...overrides,
  };
}

describe('InMemoryForecastRepository', () => {
  let repository: InMemoryForecastRepository;
  let store: InMemorySingleTableStore;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryForecastRepository(store);
  });

  describe('createIfAbsent', () => {
    it('新規作成し、getByTickerAndDate で取得できる', async () => {
      const result = await repository.createIfAbsent(buildInput());

      expect(result.created).toBe(true);
      expect(result.item.outcome).toBeUndefined();
      expect(await repository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27')).toEqual(result.item);
    });

    it('既に存在する場合は書き込まず created:false を返す', async () => {
      const first = await repository.createIfAbsent(buildInput());
      const second = await repository.createIfAbsent(buildInput({ axisValues: { changed: true } }));

      expect(second.created).toBe(false);
      // 予測部分は最初に書いた値のまま（後勝ちで上書きされない）
      expect(second.item.axisValues).toEqual({ 'buy-count-ge2': true });
      expect(second.item).toEqual(first.item);
    });

    it('作成が衝突したのに既存が見つからないときは RepositoryError 派生の DatabaseError をスローする', async () => {
      await repository.createIfAbsent(buildInput());
      // create の存在確認では既存を返し、その後の get では見つからない状況を作る
      const existing = store.get('FORECAST#NSDQ:AAPL', 'DATE#2026-02-27');
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
    const KEY = { tickerId: 'NSDQ:AAPL', date: '2026-02-27' };
    const outcome: TickerOutcome = {
      tickerId: 'NSDQ:AAPL',
      exchangeId: 'NASDAQ',
      market: 'US',
      date: '2026-02-27',
      nextDate: '2026-02-28',
      nextReturn: 0.01,
      excessReturn: 0.005,
      nextRange: 0.02,
      hit: { DIR: true },
      evaluatedAt: 1_700_100_000_000,
    };

    it('既存 Forecast に Outcome（識別子を除いた形）を追記し、updatedAt を進める', async () => {
      const created = await repository.createIfAbsent(buildInput());
      await new Promise((resolve) => setTimeout(resolve, 5));

      const result = await repository.appendOutcome(KEY, outcome);

      expect(result.updated).toBe(true);
      expect(result.item.outcome).toEqual({
        nextDate: '2026-02-28',
        nextReturn: 0.01,
        excessReturn: 0.005,
        nextRange: 0.02,
        hit: { DIR: true },
        evaluatedAt: 1_700_100_000_000,
      });
      expect(result.item.updatedAt).toBeGreaterThan(created.item.updatedAt);
      expect(await repository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27')).toEqual(result.item);
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

    it('取引所別の検索に使うキー（GSI4）を保つ', async () => {
      await repository.createIfAbsent(buildInput());

      await repository.appendOutcome(KEY, outcome);

      expect(await repository.getByExchangeAndDate('NASDAQ', '2026-02-27')).toHaveLength(1);
    });

    it('既に Outcome がある場合は上書きせず updated:false を返す', async () => {
      await repository.createIfAbsent(buildInput());
      await repository.appendOutcome(KEY, outcome);

      const second = await repository.appendOutcome(KEY, { ...outcome, hit: { DIR: false } });

      expect(second.updated).toBe(false);
      // 最初の Outcome のまま（後勝ちで上書きされない）
      expect(second.item.outcome?.hit.DIR).toBe(true);
    });

    it('対象が存在しない場合は EntityNotFoundError をスローする', async () => {
      await expect(
        repository.appendOutcome({ tickerId: 'NO-SUCH', date: '2026-02-27' }, outcome)
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });
  });

  describe('getByExchangeAndDate', () => {
    it('同一取引所・同一日の Forecast を TickerID 昇順で返す', async () => {
      await repository.createIfAbsent(buildInput({ tickerId: 'T2' }));
      await repository.createIfAbsent(buildInput({ tickerId: 'T1' }));
      // 他日・他取引所（対象外）
      await repository.createIfAbsent(buildInput({ tickerId: 'T3', date: '2026-02-26' }));
      await repository.createIfAbsent(buildInput({ tickerId: 'T4', exchangeId: 'NYSE' }));

      const result = await repository.getByExchangeAndDate('NASDAQ', '2026-02-27');

      expect(result.map((i) => i.tickerId)).toEqual(['T1', 'T2']);
    });

    it('store の既定ページサイズ (100件) を超えても全件を返す', async () => {
      for (let index = 0; index < 120; index++) {
        await repository.createIfAbsent(
          buildInput({ tickerId: `T${String(index).padStart(3, '0')}` })
        );
      }

      expect(await repository.getByExchangeAndDate('NASDAQ', '2026-02-27')).toHaveLength(120);
    });

    it('日次サマリーの GSI4 に相乗りしても、日次サマリーを拾わない', async () => {
      await repository.createIfAbsent(buildInput());
      await new InMemoryDailySummaryRepository(store).upsert({
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        date: '2026-02-27',
        open: 100,
        high: 110,
        low: 95,
        close: 108,
      });

      const result = await repository.getByExchangeAndDate('NASDAQ', '2026-02-27');

      expect(result).toHaveLength(1);
    });

    it('読めないアイテムを含むと InvalidEntityDataError をスローする', async () => {
      await repository.createIfAbsent(buildInput());
      store.put({
        ...(store.get('FORECAST#NSDQ:AAPL', 'DATE#2026-02-27') ?? {}),
        Source: 'UNKNOWN',
      } as Parameters<typeof store.put>[0]);

      await expect(repository.getByExchangeAndDate('NASDAQ', '2026-02-27')).rejects.toThrow(
        InvalidEntityDataError
      );
    });
  });

  describe('getSamplesByExchangesAndDateRange', () => {
    it('期間内のサンプルを取引所ごとにまとめて返す', async () => {
      await repository.createIfAbsent(buildInput({ tickerId: 'T1', date: '2026-02-01' }));
      await repository.createIfAbsent(buildInput({ tickerId: 'T2', date: '2026-02-15' }));
      await repository.createIfAbsent(buildInput({ tickerId: 'T3', date: '2026-03-01' }));
      await repository.createIfAbsent(
        buildInput({ tickerId: 'T4', exchangeId: 'NYSE', date: '2026-02-15' })
      );

      const result = await repository.getSamplesByExchangesAndDateRange(
        ['NASDAQ', 'NYSE'],
        '2026-02-01',
        '2026-02-28'
      );

      expect(result.map((s) => s.tickerId).sort()).toEqual(['T1', 'T2', 'T4']);
    });

    it('toDate の日付の Forecast を、ティッカーIDによらず含む', async () => {
      await repository.createIfAbsent(buildInput({ tickerId: 'ZZZZ:ZZZZ', date: '2026-02-28' }));

      const result = await repository.getSamplesByExchangesAndDateRange(
        ['NASDAQ'],
        '2026-02-28',
        '2026-02-28'
      );

      expect(result.map((s) => s.tickerId)).toEqual(['ZZZZ:ZZZZ']);
    });

    it('fromDate・toDate を省略すると全期間を返す', async () => {
      await repository.createIfAbsent(buildInput({ tickerId: 'T1', date: '2026-01-01' }));
      await repository.createIfAbsent(buildInput({ tickerId: 'T2', date: '2026-12-31' }));

      expect(await repository.getSamplesByExchangesAndDateRange(['NASDAQ'])).toHaveLength(2);
    });

    it('fromDate のみ指定すると、それ以降を返す', async () => {
      await repository.createIfAbsent(buildInput({ tickerId: 'T1', date: '2026-01-01' }));
      await repository.createIfAbsent(buildInput({ tickerId: 'T2', date: '2026-06-01' }));

      const result = await repository.getSamplesByExchangesAndDateRange(['NASDAQ'], '2026-03-01');

      expect(result.map((s) => s.tickerId)).toEqual(['T2']);
    });

    it('toDate のみ指定すると、それ以前を返す', async () => {
      await repository.createIfAbsent(buildInput({ tickerId: 'T1', date: '2026-01-01' }));
      await repository.createIfAbsent(buildInput({ tickerId: 'T2', date: '2026-06-01' }));

      const result = await repository.getSamplesByExchangesAndDateRange(
        ['NASDAQ'],
        undefined,
        '2026-03-01'
      );

      expect(result.map((s) => s.tickerId)).toEqual(['T1']);
    });
  });
});
