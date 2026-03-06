/**
 * Stock Tracker Core - InMemory Daily Summary Repository Unit Tests
 *
 * InMemoryDailySummaryRepositoryのユニットテスト
 */

import { InMemoryDailySummaryRepository } from '../../../src/repositories/in-memory-daily-summary.repository.js';
import { InMemorySingleTableStore } from '@nagiyu/aws';
import type { CreateDailySummaryInput } from '../../../src/entities/daily-summary.entity.js';

describe('InMemoryDailySummaryRepository', () => {
  let repository: InMemoryDailySummaryRepository;

  beforeEach(() => {
    repository = new InMemoryDailySummaryRepository(new InMemorySingleTableStore());
  });

  describe('getByExchange', () => {
    it('date指定時は指定日のサマリーのみを返す', async () => {
      const targetDate = '2026-02-27';

      await repository.upsert({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: targetDate,
        Open: 100,
        High: 110,
        Low: 95,
        Close: 108,
      });
      await repository.upsert({
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
        Date: targetDate,
        Open: 200,
        High: 215,
        Low: 198,
        Close: 210,
      });
      await repository.upsert({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-28',
        Open: 109,
        High: 112,
        Low: 107,
        Close: 111,
      });

      const result = await repository.getByExchange('NASDAQ', targetDate);

      expect(result).toHaveLength(2);
      expect(result.every((summary) => summary.Date === targetDate)).toBe(true);
    });

    it('date未指定時は取引所内で最新日付のサマリーのみを返す', async () => {
      await repository.upsert({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 100,
        High: 110,
        Low: 95,
        Close: 108,
      });
      await repository.upsert({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-28',
        Open: 109,
        High: 112,
        Low: 107,
        Close: 111,
      });
      await repository.upsert({
        TickerID: 'NYSE:IBM',
        ExchangeID: 'NYSE',
        Date: '2026-03-01',
        Open: 300,
        High: 305,
        Low: 298,
        Close: 304,
      });

      const result = await repository.getByExchange('NASDAQ');

      expect(result).toHaveLength(1);
      expect(result[0].TickerID).toBe('NSDQ:AAPL');
      expect(result[0].Date).toBe('2026-02-28');
    });
  });

  describe('upsert', () => {
    it('新規作成時はCreatedAtとUpdatedAtを設定して保存する', async () => {
      const input: CreateDailySummaryInput = {
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 100,
        High: 110,
        Low: 95,
        Close: 108,
      };

      const result = await repository.upsert(input);

      expect(result).toMatchObject(input);
      expect(result.CreatedAt).toBeDefined();
      expect(result.UpdatedAt).toBeDefined();
      expect(result.CreatedAt).toBe(result.UpdatedAt);
    });

    it('同一TickerID+Dateのupsertは既存レコードを更新し、CreatedAtを維持して重複を作らない', async () => {
      const input: CreateDailySummaryInput = {
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 100,
        High: 110,
        Low: 95,
        Close: 108,
      };
      const first = await repository.upsert(input);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await repository.upsert({
        ...input,
        Open: 101,
        High: 111,
        Low: 96,
        Close: 109,
      });
      const byDate = await repository.getByExchange('NASDAQ', '2026-02-27');

      expect(updated.CreatedAt).toBe(first.CreatedAt);
      expect(updated.UpdatedAt).toBeGreaterThan(first.UpdatedAt);
      expect(updated.Open).toBe(101);
      expect(updated.Close).toBe(109);
      expect(byDate).toHaveLength(1);
      expect(byDate[0].Open).toBe(101);
      expect(byDate[0].Close).toBe(109);
    });
  });

  describe('getRecentByTicker', () => {
    it('終了日以前のデータを日付降順で指定件数返す', async () => {
      await repository.upsert({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-25',
        Open: 95,
        High: 101,
        Low: 93,
        Close: 99,
      });
      await repository.upsert({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-26',
        Open: 99,
        High: 103,
        Low: 96,
        Close: 101,
      });
      await repository.upsert({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 101,
        High: 108,
        Low: 100,
        Close: 107,
      });
      await repository.upsert({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-28',
        Open: 108,
        High: 110,
        Low: 104,
        Close: 105,
      });

      const result = await repository.getRecentByTicker('NSDQ:AAPL', '2026-02-27', 2);

      expect(result).toHaveLength(2);
      expect(result.map((summary) => summary.Date)).toEqual(['2026-02-27', '2026-02-26']);
    });

    it('count が 0 以下なら空配列を返す', async () => {
      const result = await repository.getRecentByTicker('NSDQ:AAPL', '2026-02-27', 0);

      expect(result).toEqual([]);
    });
  });
});
