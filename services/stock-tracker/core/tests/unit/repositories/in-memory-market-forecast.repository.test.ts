/**
 * Stock Tracker Core - InMemory MarketForecast Repository Unit Tests
 *
 * InMemoryMarketForecastRepositoryのユニットテスト
 */
import { EntityNotFoundError, InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryMarketForecastRepository } from '../../../src/repositories/in-memory-market-forecast.repository.js';
import type { CreateMarketForecastInput } from '../../../src/entities/market-forecast.entity.js';
import type { MarketOutcome } from '../../../src/forecast/index.js';

function buildInput(overrides: Partial<CreateMarketForecastInput> = {}): CreateMarketForecastInput {
  return {
    Market: 'US',
    Date: '2026-02-27',
    AxisValues: { 'market-range-avg': 0.1 },
    Probabilities: {},
    ModelVersion: 'forecast-core-v1',
    Source: 'LIVE',
    ...overrides,
  };
}

describe('InMemoryMarketForecastRepository', () => {
  let repository: InMemoryMarketForecastRepository;

  beforeEach(() => {
    repository = new InMemoryMarketForecastRepository(new InMemorySingleTableStore());
  });

  describe('createIfAbsent', () => {
    it('新規作成し、getByMarketAndDate で取得できる', async () => {
      const result = await repository.createIfAbsent(buildInput());
      expect(result.created).toBe(true);

      const fetched = await repository.getByMarketAndDate('US', '2026-02-27');
      expect(fetched).toEqual(result.item);
    });

    it('既に存在する場合は書き込まず created:false を返す', async () => {
      await repository.createIfAbsent(buildInput());
      const second = await repository.createIfAbsent(buildInput({ AxisValues: { changed: 999 } }));

      expect(second.created).toBe(false);
      expect(second.item.AxisValues).toEqual({ 'market-range-avg': 0.1 });
    });
  });

  describe('appendOutcome', () => {
    const outcome: MarketOutcome = {
      market: 'US',
      date: '2026-02-27',
      nextDate: '2026-02-28',
      nextRange: 0.09,
      hit: { MKT: true },
      evaluatedAt: 1_700_100_000_000,
    };

    it('既存 MarketForecast に Outcome を追記する', async () => {
      await repository.createIfAbsent(buildInput());
      const result = await repository.appendOutcome({ market: 'US', date: '2026-02-27' }, outcome);
      expect(result.updated).toBe(true);
      expect(result.item.Outcome?.hit.MKT).toBe(true);
    });

    it('既に Outcome がある場合は上書きせず updated:false を返す', async () => {
      await repository.createIfAbsent(buildInput());
      await repository.appendOutcome({ market: 'US', date: '2026-02-27' }, outcome);
      const second = await repository.appendOutcome(
        { market: 'US', date: '2026-02-27' },
        { ...outcome, hit: { MKT: false } }
      );
      expect(second.updated).toBe(false);
      expect(second.item.Outcome?.hit.MKT).toBe(true);
    });

    it('対象が存在しない場合は EntityNotFoundError をスローする', async () => {
      await expect(
        repository.appendOutcome({ market: 'JP', date: '2026-02-27' }, outcome)
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });
  });

  describe('getSamplesByDateRange', () => {
    it('期間内のサンプルを Date 順に返す', async () => {
      await repository.createIfAbsent(buildInput({ Date: '2026-02-01' }));
      await repository.createIfAbsent(buildInput({ Date: '2026-02-15' }));
      await repository.createIfAbsent(buildInput({ Date: '2026-03-01' }));
      await repository.createIfAbsent(buildInput({ Market: 'JP', Date: '2026-02-15' }));

      const result = await repository.getSamplesByDateRange('US', '2026-02-01', '2026-02-28');
      expect(result.map((s) => s.date)).toEqual(['2026-02-01', '2026-02-15']);
    });

    it('fromDate・toDate を省略すると全期間を返す', async () => {
      await repository.createIfAbsent(buildInput({ Date: '2026-01-01' }));
      await repository.createIfAbsent(buildInput({ Date: '2026-12-31' }));

      const result = await repository.getSamplesByDateRange('US');
      expect(result).toHaveLength(2);
    });

    it('fromDate のみ指定すると、それ以降を返す', async () => {
      await repository.createIfAbsent(buildInput({ Date: '2026-01-01' }));
      await repository.createIfAbsent(buildInput({ Date: '2026-06-01' }));

      const result = await repository.getSamplesByDateRange('US', '2026-03-01');
      expect(result.map((s) => s.date)).toEqual(['2026-06-01']);
    });
  });
});
