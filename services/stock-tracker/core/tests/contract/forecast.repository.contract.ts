/**
 * ForecastRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に同一の仕様を通し、実装間の乖離
 * （条件付き書き込みの意味論・GSI4 射影・ページングなど）を機械的に検知する。
 * 「一度書いたら書き換えない」（条件付き作成・Outcome の一度きりの追記）を中心に検証する。
 */
import type { ForecastRepository } from '../../src/repositories/forecast.repository.interface.js';
import type { CreateForecastInput } from '../../src/entities/forecast.entity.js';
import type { TickerOutcome } from '../../src/forecast/index.js';

/** 契約テストの対象実装が満たすべきフック */
export interface ForecastRepositoryContractHooks {
  makeRepository: () => Promise<ForecastRepository>;
  reset: () => Promise<void>;
  teardown?: () => Promise<void>;
}

function buildForecastInput(overrides: Partial<CreateForecastInput> = {}): CreateForecastInput {
  return {
    TickerID: 'NSDQ:AAPL',
    ExchangeID: 'NASDAQ',
    Market: 'US',
    Date: '2026-02-27',
    AxisValues: { 'buy-count-ge2': true, 'range-today': 0.12 },
    Normal: { range: 0.03, volume: 1_000_000 },
    Probabilities: {
      DIR: {
        probability: 0.52,
        baseline: 0.5,
        neutralBand: { lower: -0.05, upper: 0.05 },
        bandHistory: null,
        lean: 'NEUTRAL',
        contributions: { 'buy-count-ge2': 0.01 },
        lowSampleAxes: [],
      },
    },
    ModelVersion: 'forecast-core-v1',
    Source: 'LIVE',
    ...overrides,
  };
}

function buildOutcome(overrides: Partial<TickerOutcome> = {}): TickerOutcome {
  return {
    tickerId: 'NSDQ:AAPL',
    exchangeId: 'NASDAQ',
    market: 'US',
    date: '2026-02-27',
    nextDate: '2026-02-28',
    nextReturn: 0.01,
    excessReturn: 0.005,
    nextRange: 0.02,
    rangeRatio: 1.1,
    hit: { DIR: true, VOL: false },
    evaluatedAt: 1_700_100_000_000,
    ...overrides,
  };
}

/** `baseDate`（YYYY-MM-DD）から`days`日後の日付をYYYY-MM-DD形式で返す（UTC基準） */
function addDays(baseDate: string, days: number): string {
  const [year, month, day] = baseDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * 24 * 60 * 60 * 1000);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function defineForecastRepositoryContract(
  label: string,
  hooks: ForecastRepositoryContractHooks
): void {
  describe(`ForecastRepository 契約: ${label}`, () => {
    let repository: ForecastRepository;

    beforeEach(async () => {
      await hooks.reset();
      repository = await hooks.makeRepository();
    });

    afterAll(async () => {
      if (hooks.teardown) {
        await hooks.teardown();
      }
    });

    it('getByTickerAndDate は未登録の Forecast に対して null を返す', async () => {
      expect(await repository.getByTickerAndDate('NO-SUCH', '2026-02-27')).toBeNull();
    });

    it('createIfAbsent は新規作成し、getByTickerAndDate で取得できる', async () => {
      const input = buildForecastInput();
      const result = await repository.createIfAbsent(input);

      expect(result.created).toBe(true);
      expect(result.item).toMatchObject(input);
      expect(result.item.CreatedAt).toBeGreaterThan(0);

      const fetched = await repository.getByTickerAndDate(input.TickerID, input.Date);
      expect(fetched).toEqual(result.item);
    });

    it('createIfAbsent は既に存在する場合、書き込まず既存の値を created:false で返す（冪等な再実行）', async () => {
      const first = await repository.createIfAbsent(buildForecastInput());
      const second = await repository.createIfAbsent(
        buildForecastInput({ AxisValues: { changed: true } })
      );

      expect(second.created).toBe(false);
      expect(second.item).toEqual(first.item);

      const fetched = await repository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27');
      // 予測部分は最初に書いた値のまま（一度書いたら書き換えない）
      expect(fetched?.AxisValues).toEqual(buildForecastInput().AxisValues);
    });

    it('appendOutcome は既存 Forecast に Outcome を追記し、予測部分は変更しない', async () => {
      const created = await repository.createIfAbsent(buildForecastInput());
      const result = await repository.appendOutcome(
        { tickerId: 'NSDQ:AAPL', date: '2026-02-27' },
        buildOutcome()
      );

      expect(result.updated).toBe(true);
      expect(result.item.Outcome).toEqual({
        nextDate: '2026-02-28',
        nextReturn: 0.01,
        excessReturn: 0.005,
        nextRange: 0.02,
        rangeRatio: 1.1,
        hit: { DIR: true, VOL: false },
        evaluatedAt: 1_700_100_000_000,
      });
      // 予測部分（AxisValues・Normal・Probabilities）は一切変わらない
      expect(result.item.AxisValues).toEqual(created.item.AxisValues);
      expect(result.item.Normal).toEqual(created.item.Normal);
      expect(result.item.Probabilities).toEqual(created.item.Probabilities);
    });

    it('appendOutcome は既に Outcome がある場合、上書きせず updated:false で既存を返す（冪等な再実行）', async () => {
      await repository.createIfAbsent(buildForecastInput());
      const first = await repository.appendOutcome(
        { tickerId: 'NSDQ:AAPL', date: '2026-02-27' },
        buildOutcome()
      );
      const second = await repository.appendOutcome(
        { tickerId: 'NSDQ:AAPL', date: '2026-02-27' },
        buildOutcome({ hit: { DIR: false, VOL: true } })
      );

      expect(second.updated).toBe(false);
      expect(second.item.Outcome).toEqual(first.item.Outcome);
    });

    it('appendOutcome は対象 Forecast が存在しない場合 EntityNotFoundError をスローする', async () => {
      await expect(
        repository.appendOutcome({ tickerId: 'NO-SUCH', date: '2026-02-27' }, buildOutcome())
      ).rejects.toThrow(expect.objectContaining({ name: 'EntityNotFoundError' }));
    });

    it('getByExchangeAndDate は同一取引所・同一日の Forecast を TickerID 昇順で返す（パーティション分離を含む）', async () => {
      await repository.createIfAbsent(buildForecastInput({ TickerID: 'C' }));
      await repository.createIfAbsent(buildForecastInput({ TickerID: 'B' }));
      // 他日（対象外）
      await repository.createIfAbsent(buildForecastInput({ TickerID: 'A', Date: '2026-02-26' }));
      // 他取引所（対象外）
      await repository.createIfAbsent(buildForecastInput({ TickerID: 'D', ExchangeID: 'NYSE' }));

      const result = await repository.getByExchangeAndDate('NASDAQ', '2026-02-27');

      expect(result.map((item) => item.TickerID)).toEqual(['B', 'C']);
      expect(
        result.every((item) => item.ExchangeID === 'NASDAQ' && item.Date === '2026-02-27')
      ).toBe(true);
    });

    it('getSamplesByExchangesAndDateRange は境界日（fromDate/toDateちょうど）を含み、複数取引所をまとめて返す', async () => {
      await repository.createIfAbsent(buildForecastInput({ TickerID: 'T1', Date: '2026-02-01' }));
      await repository.createIfAbsent(buildForecastInput({ TickerID: 'T2', Date: '2026-02-27' }));
      // 範囲外（対象外）
      await repository.createIfAbsent(buildForecastInput({ TickerID: 'T3', Date: '2026-03-01' }));
      // 別取引所（同じ市場。対象）
      await repository.createIfAbsent(
        buildForecastInput({ TickerID: 'T4', ExchangeID: 'NYSE', Date: '2026-02-15' })
      );

      const result = await repository.getSamplesByExchangesAndDateRange(
        ['NASDAQ', 'NYSE'],
        '2026-02-01',
        '2026-02-27'
      );

      expect(result.map((s) => s.tickerId).sort()).toEqual(['T1', 'T2', 'T4']);
    });

    it('getSamplesByExchangesAndDateRange は fromDate・toDate 省略時に全期間を返す', async () => {
      await repository.createIfAbsent(buildForecastInput({ TickerID: 'T1', Date: '2026-01-01' }));
      await repository.createIfAbsent(buildForecastInput({ TickerID: 'T2', Date: '2026-12-31' }));

      const result = await repository.getSamplesByExchangesAndDateRange(['NASDAQ']);
      expect(result.map((s) => s.tickerId).sort()).toEqual(['T1', 'T2']);
    });

    it('getSamplesByExchangesAndDateRange は toDate だけ指定すると、その日以前を返す', async () => {
      await repository.createIfAbsent(buildForecastInput({ TickerID: 'T1', Date: '2026-01-01' }));
      await repository.createIfAbsent(buildForecastInput({ TickerID: 'T2', Date: '2026-02-27' }));
      await repository.createIfAbsent(buildForecastInput({ TickerID: 'T3', Date: '2026-03-01' }));

      const result = await repository.getSamplesByExchangesAndDateRange(
        ['NASDAQ'],
        undefined,
        '2026-02-27'
      );
      expect(result.map((s) => s.tickerId).sort()).toEqual(['T1', 'T2']);
    });

    it('getSamplesByExchangesAndDateRange は採点済みサンプルの outcome・probabilities を含む', async () => {
      await repository.createIfAbsent(buildForecastInput());
      await repository.appendOutcome({ tickerId: 'NSDQ:AAPL', date: '2026-02-27' }, buildOutcome());

      const result = await repository.getSamplesByExchangesAndDateRange(['NASDAQ']);
      expect(result).toHaveLength(1);
      expect(result[0].outcome).toEqual({
        nextDate: '2026-02-28',
        hit: { DIR: true, VOL: false },
        excessReturn: 0.005,
      });
      expect(result[0].probabilities).toEqual({ DIR: { probability: 0.52, baseline: 0.5 } });
    });

    it('getSamplesByExchangesAndDateRange は100件超でもページ境界をまたいで全件を取りこぼさない', async () => {
      const total = 130;
      const baseDate = '2026-01-01';
      for (let i = 0; i < total; i += 1) {
        await repository.createIfAbsent(
          buildForecastInput({
            TickerID: `T${String(i).padStart(4, '0')}`,
            Date: addDays(baseDate, i),
          })
        );
      }

      const result = await repository.getSamplesByExchangesAndDateRange(['NASDAQ']);
      expect(result).toHaveLength(total);
      expect(new Set(result.map((s) => s.tickerId)).size).toBe(total);
    });
  });
}
