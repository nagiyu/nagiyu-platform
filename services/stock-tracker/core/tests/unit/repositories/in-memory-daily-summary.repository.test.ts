/**
 * Stock Tracker Core - InMemory Daily Summary Repository Unit Tests
 *
 * InMemoryDailySummaryRepositoryのユニットテスト
 *
 * 単一アイテムの CRUD の振る舞い (エラー変換など) は EntityStore の責務のため、
 * ここでは Repository 経由で正しく動くことと、GSI4 の近似クエリ・upsert の作成日時の引き継ぎだけを検証する。
 */

import { InMemoryDailySummaryRepository } from '../../../src/repositories/in-memory-daily-summary.repository.js';
import { InMemorySingleTableStore, InvalidEntityDataError } from '@nagiyu/aws';
import type { CreateDailySummaryInput } from '../../../src/entities/daily-summary.entity.js';

function buildInput(overrides: Partial<CreateDailySummaryInput> = {}): CreateDailySummaryInput {
  return {
    tickerId: 'NSDQ:AAPL',
    exchangeId: 'NASDAQ',
    date: '2026-02-27',
    open: 100,
    high: 110,
    low: 95,
    close: 108,
    ...overrides,
  };
}

describe('InMemoryDailySummaryRepository', () => {
  let repository: InMemoryDailySummaryRepository;
  let store: InMemorySingleTableStore;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryDailySummaryRepository(store);
  });

  describe('getByTickerAndDate', () => {
    it('保存したサマリーを Entity として取得できる', async () => {
      const saved = await repository.upsert(buildInput({ volume: 1000000 }));

      expect(await repository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27')).toEqual(saved);
    });

    it('未登録のサマリーは null を返す', async () => {
      expect(await repository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27')).toBeNull();
    });
  });

  describe('getByExchange', () => {
    it('date指定時は指定日のサマリーのみを返す', async () => {
      await repository.upsert(buildInput({ volume: 1000000 }));
      await repository.upsert(buildInput({ tickerId: 'NSDQ:NVDA', volume: 2000000 }));
      await repository.upsert(buildInput({ date: '2026-02-28' }));

      const result = await repository.getByExchange('NASDAQ', '2026-02-27');

      expect(result).toHaveLength(2);
      expect(result.every((summary) => summary.date === '2026-02-27')).toBe(true);
      expect(result[0].volume).toBeDefined();
    });

    it('date未指定時は取引所内で最新日付のサマリーのみを返す', async () => {
      await repository.upsert(buildInput());
      await repository.upsert(buildInput({ date: '2026-02-28', volume: 1100000 }));
      await repository.upsert(
        buildInput({ tickerId: 'NYSE:IBM', exchangeId: 'NYSE', date: '2026-03-01' })
      );

      const result = await repository.getByExchange('NASDAQ');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        tickerId: 'NSDQ:AAPL',
        date: '2026-02-28',
        volume: 1100000,
      });
    });

    it('同日内はティッカーID昇順で返す', async () => {
      await repository.upsert(buildInput({ tickerId: 'NSDQ:NVDA' }));
      await repository.upsert(buildInput({ tickerId: 'NSDQ:AAPL' }));
      await repository.upsert(buildInput({ tickerId: 'NSDQ:MSFT' }));

      const result = await repository.getByExchange('NASDAQ', '2026-02-27');

      expect(result.map((r) => r.tickerId)).toEqual(['NSDQ:AAPL', 'NSDQ:MSFT', 'NSDQ:NVDA']);
    });

    it('取引所にサマリーがなければ空配列を返す', async () => {
      expect(await repository.getByExchange('NASDAQ')).toEqual([]);
    });

    it('store の既定ページサイズ (100件) を超えても全件を返す', async () => {
      for (let index = 0; index < 120; index++) {
        await repository.upsert(
          buildInput({ tickerId: `NSDQ:T${String(index).padStart(3, '0')}` })
        );
      }

      expect(await repository.getByExchange('NASDAQ', '2026-02-27')).toHaveLength(120);
    });

    it('読めないアイテムを含むと InvalidEntityDataError をスローする', async () => {
      await repository.upsert(buildInput());
      store.put({
        ...(store.get('SUMMARY#NSDQ:AAPL', 'DATE#2026-02-27') ?? {}),
        Close: 'broken',
      } as Parameters<typeof store.put>[0]);

      await expect(repository.getByExchange('NASDAQ', '2026-02-27')).rejects.toThrow(
        InvalidEntityDataError
      );
    });
  });

  describe('upsert', () => {
    it('新規作成時は createdAt と updatedAt を設定して保存する', async () => {
      const input = buildInput({ volume: 1000000 });

      const result = await repository.upsert(input);

      expect(result).toMatchObject(input);
      // updatedAt は EntityStore が書き込み時に採番するため、createdAt と同一ミリ秒とは限らない
      expect(result.updatedAt).toBeGreaterThanOrEqual(result.createdAt);
    });

    it('同一tickerId+dateのupsertは既存レコードを更新し、createdAtを維持して重複を作らない', async () => {
      const first = await repository.upsert(buildInput({ volume: 1000000 }));
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await repository.upsert(
        buildInput({ open: 101, high: 111, low: 96, close: 109, volume: 1200000 })
      );
      const byDate = await repository.getByExchange('NASDAQ', '2026-02-27');

      expect(updated.createdAt).toBe(first.createdAt);
      expect(updated.updatedAt).toBeGreaterThan(first.updatedAt);
      expect(updated).toMatchObject({ open: 101, close: 109, volume: 1200000 });
      expect(byDate).toHaveLength(1);
      expect(byDate[0]).toMatchObject({ open: 101, close: 109, volume: 1200000 });
    });

    it('上書きで任意項目を省くと、その項目は残らない', async () => {
      await repository.upsert(buildInput({ volume: 1000000, buyPatternCount: 1 }));

      await repository.upsert(buildInput());

      const saved = await repository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27');
      expect(saved?.volume).toBeUndefined();
      expect(saved?.buyPatternCount).toBeUndefined();
    });
  });

  describe('getByExchangeAndDateRange', () => {
    beforeEach(async () => {
      await repository.upsert(buildInput({ date: '2026-02-25' }));
      await repository.upsert(buildInput({ date: '2026-02-27' }));
      await repository.upsert(buildInput({ date: '2026-03-01' }));
      await repository.upsert(
        buildInput({ tickerId: 'NYSE:IBM', exchangeId: 'NYSE', date: '2026-02-26' })
      );
    });

    it('指定 Exchange × 日付範囲（両端含む）のサマリーのみ返す', async () => {
      const result = await repository.getByExchangeAndDateRange(
        'NASDAQ',
        '2026-02-25',
        '2026-02-27'
      );

      expect(result.map((r) => r.date)).toEqual(['2026-02-25', '2026-02-27']);
      expect(result.every((r) => r.exchangeId === 'NASDAQ')).toBe(true);
    });

    it('範囲外（toDate より後）のサマリーは含まれない', async () => {
      const result = await repository.getByExchangeAndDateRange(
        'NASDAQ',
        '2026-02-25',
        '2026-02-28'
      );

      expect(result.some((r) => r.date === '2026-03-01')).toBe(false);
    });

    it('toDate の日付のサマリーを、ティッカーIDによらず含む', async () => {
      await repository.upsert(buildInput({ tickerId: 'NSDQ:ZZZZ', date: '2026-02-27' }));

      const result = await repository.getByExchangeAndDateRange(
        'NASDAQ',
        '2026-02-27',
        '2026-02-27'
      );

      expect(result.map((r) => r.tickerId)).toEqual(['NSDQ:AAPL', 'NSDQ:ZZZZ']);
    });

    it('該当なしの場合は空配列を返す', async () => {
      expect(
        await repository.getByExchangeAndDateRange('NASDAQ', '2025-01-01', '2025-01-31')
      ).toEqual([]);
    });
  });

  describe('getForecastFieldsByExchangeAndDateRange', () => {
    it('updatedAt を持たず、確度算出に使う属性だけを返す', async () => {
      await repository.upsert(
        buildInput({ date: '2026-02-25', volume: 999, buyPatternCount: 1, sellPatternCount: 0 })
      );
      await repository.upsert(
        buildInput({ tickerId: 'NYSE:IBM', exchangeId: 'NYSE', date: '2026-02-25' })
      );

      const result = await repository.getForecastFieldsByExchangeAndDateRange(
        'NASDAQ',
        '2026-02-25',
        '2026-02-25'
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        date: '2026-02-25',
        open: 100,
        high: 110,
        low: 95,
        close: 108,
        volume: 999,
        buyPatternCount: 1,
        sellPatternCount: 0,
      });
      expect(result[0]).not.toHaveProperty('updatedAt');
    });
  });
});
