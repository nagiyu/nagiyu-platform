/**
 * Stock Tracker Core - InMemory Forecast Repository Unit Tests
 *
 * InMemoryForecastRepositoryのユニットテスト
 */
import { EntityNotFoundError, InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryForecastRepository } from '../../../src/repositories/in-memory-forecast.repository.js';
import type { CreateForecastInput } from '../../../src/entities/forecast.entity.js';
import type { TickerOutcome } from '../../../src/forecast/index.js';

function buildInput(overrides: Partial<CreateForecastInput> = {}): CreateForecastInput {
  return {
    TickerID: 'NSDQ:AAPL',
    ExchangeID: 'NASDAQ',
    Market: 'US',
    Date: '2026-02-27',
    AxisValues: { 'buy-count-ge2': true },
    Normal: { range: 0.03 },
    Probabilities: {},
    ModelVersion: 'forecast-core-v1',
    Source: 'LIVE',
    ...overrides,
  };
}

describe('InMemoryForecastRepository', () => {
  let repository: InMemoryForecastRepository;

  beforeEach(() => {
    repository = new InMemoryForecastRepository(new InMemorySingleTableStore());
  });

  describe('createIfAbsent', () => {
    it('新規作成し、getByTickerAndDate で取得できる', async () => {
      const result = await repository.createIfAbsent(buildInput());
      expect(result.created).toBe(true);
      expect(result.item.Outcome).toBeUndefined();

      const fetched = await repository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27');
      expect(fetched).toEqual(result.item);
    });

    it('既に存在する場合は書き込まず created:false を返す', async () => {
      await repository.createIfAbsent(buildInput());
      const second = await repository.createIfAbsent(buildInput({ AxisValues: { changed: true } }));

      expect(second.created).toBe(false);
      // 予測部分は最初に書いた値のまま（後勝ちで上書きされない）
      expect(second.item.AxisValues).toEqual({ 'buy-count-ge2': true });
    });
  });

  describe('appendOutcome', () => {
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

    it('既存 Forecast に Outcome を追記する', async () => {
      await repository.createIfAbsent(buildInput());
      const result = await repository.appendOutcome(
        { tickerId: 'NSDQ:AAPL', date: '2026-02-27' },
        outcome
      );

      expect(result.updated).toBe(true);
      expect(result.item.Outcome?.hit.DIR).toBe(true);
    });

    it('既に Outcome がある場合は上書きせず updated:false を返す', async () => {
      await repository.createIfAbsent(buildInput());
      await repository.appendOutcome({ tickerId: 'NSDQ:AAPL', date: '2026-02-27' }, outcome);

      const second = await repository.appendOutcome(
        { tickerId: 'NSDQ:AAPL', date: '2026-02-27' },
        { ...outcome, hit: { DIR: false } }
      );

      expect(second.updated).toBe(false);
      // 最初の Outcome のまま（後勝ちで上書きされない）
      expect(second.item.Outcome?.hit.DIR).toBe(true);
    });

    it('対象が存在しない場合は EntityNotFoundError をスローする', async () => {
      await expect(
        repository.appendOutcome({ tickerId: 'NO-SUCH', date: '2026-02-27' }, outcome)
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });
  });

  describe('getByExchangeAndDate', () => {
    it('同一取引所・同一日の Forecast を TickerID 昇順で返す', async () => {
      await repository.createIfAbsent(buildInput({ TickerID: 'T2' }));
      await repository.createIfAbsent(buildInput({ TickerID: 'T1' }));
      // 他日・他取引所（対象外）
      await repository.createIfAbsent(buildInput({ TickerID: 'T3', Date: '2026-02-26' }));
      await repository.createIfAbsent(buildInput({ TickerID: 'T4', ExchangeID: 'NYSE' }));

      const result = await repository.getByExchangeAndDate('NASDAQ', '2026-02-27');
      expect(result.map((i) => i.TickerID)).toEqual(['T1', 'T2']);
    });
  });

  describe('getSamplesByExchangesAndDateRange', () => {
    it('期間内のサンプルを取引所ごとにまとめて返す', async () => {
      await repository.createIfAbsent(buildInput({ TickerID: 'T1', Date: '2026-02-01' }));
      await repository.createIfAbsent(buildInput({ TickerID: 'T2', Date: '2026-02-15' }));
      await repository.createIfAbsent(buildInput({ TickerID: 'T3', Date: '2026-03-01' }));
      await repository.createIfAbsent(
        buildInput({ TickerID: 'T4', ExchangeID: 'NYSE', Date: '2026-02-15' })
      );

      const result = await repository.getSamplesByExchangesAndDateRange(
        ['NASDAQ', 'NYSE'],
        '2026-02-01',
        '2026-02-28'
      );

      expect(result.map((s) => s.tickerId).sort()).toEqual(['T1', 'T2', 'T4']);
    });

    it('fromDate・toDate を省略すると全期間を返す', async () => {
      await repository.createIfAbsent(buildInput({ TickerID: 'T1', Date: '2026-01-01' }));
      await repository.createIfAbsent(buildInput({ TickerID: 'T2', Date: '2026-12-31' }));

      const result = await repository.getSamplesByExchangesAndDateRange(['NASDAQ']);
      expect(result).toHaveLength(2);
    });

    it('fromDate のみ指定すると、それ以降を返す', async () => {
      await repository.createIfAbsent(buildInput({ TickerID: 'T1', Date: '2026-01-01' }));
      await repository.createIfAbsent(buildInput({ TickerID: 'T2', Date: '2026-06-01' }));

      const result = await repository.getSamplesByExchangesAndDateRange(['NASDAQ'], '2026-03-01');
      expect(result.map((s) => s.tickerId)).toEqual(['T2']);
    });
  });
});
