/**
 * Unit tests for summary batch processing
 */

import { InMemorySingleTableStore } from '@nagiyu/aws';
import {
  InMemoryDailySummaryRepository,
  InMemoryExchangeRepository,
  InMemoryTickerRepository,
} from '@nagiyu/stock-tracker-core';
import { handler } from '../../src/summary.js';
import type { ScheduledEvent } from '../../src/summary.js';
import { getChartData } from '@nagiyu/stock-tracker-core';
import { isTradingHours } from '@nagiyu/stock-tracker-core';

describe('summary batch handler', () => {
  let exchangeRepository: InMemoryExchangeRepository;
  let tickerRepository: InMemoryTickerRepository;
  let dailySummaryRepository: InMemoryDailySummaryRepository;
  let mockEvent: ScheduledEvent;

  beforeEach(() => {
    const store = new InMemorySingleTableStore();
    exchangeRepository = new InMemoryExchangeRepository(store);
    tickerRepository = new InMemoryTickerRepository(store);
    dailySummaryRepository = new InMemoryDailySummaryRepository(store);

    mockEvent = {
      version: '0',
      id: 'test-event-id',
      'detail-type': 'Scheduled Event',
      source: 'aws.events',
      account: '123456789012',
      time: '2026-02-27T23:00:00Z',
      region: 'ap-northeast-1',
      resources: ['arn:aws:events:ap-northeast-1:123456789012:rule/test'],
      detail: {},
    };
  });

  describe('シナリオ1: 取引時間終了済み取引所のサマリーが生成される', () => {
    it('取引終了後の取引所に属するティッカーのOHLCを保存する', async () => {
      await exchangeRepository.create({
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '09:00',
        End: '17:00',
      });
      await tickerRepository.create({
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      });

      const isTradingHoursFn: jest.MockedFunction<typeof isTradingHours> = jest
        .fn()
        .mockReturnValue(false);
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 27),
          open: 100,
          high: 110,
          low: 95,
          close: 108,
          volume: 1000,
        },
      ]);
      // 2026-02-27 (金曜日) 23:00 UTC = 18:00 ET (取引終了後)
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0));

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        isTradingHoursFn,
        getChartDataFn,
        nowFn,
      });

      expect(response.statusCode).toBe(200);
      expect(getChartDataFn).toHaveBeenCalledWith('NSDQ:AAPL', 'D', {
        count: 50,
        session: 'extended',
      });

      const summaries = await dailySummaryRepository.getByExchange('NASDAQ', '2026-02-27');
      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toMatchObject({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 100,
        High: 110,
        Low: 95,
        Close: 108,
      });
      expect(summaries[0].Patterns).toBeDefined();
      expect(Array.isArray(summaries[0].Patterns)).toBe(true);
    });
  });

  describe('シナリオ2: 取引中の取引所がスキップされる', () => {
    it('取引中の取引所ではサマリーを生成しない', async () => {
      await exchangeRepository.create({
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '09:00',
        End: '17:00',
      });
      await tickerRepository.create({
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      });

      const isTradingHoursFn: jest.MockedFunction<typeof isTradingHours> = jest
        .fn()
        .mockReturnValue(true);
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn();
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0));

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        isTradingHoursFn,
        getChartDataFn,
        nowFn,
      });

      expect(response.statusCode).toBe(200);
      expect(getChartDataFn).not.toHaveBeenCalled();

      const summaries = await dailySummaryRepository.getByExchange('NASDAQ');
      expect(summaries).toHaveLength(0);
    });
  });

  describe('シナリオ3: 既存サマリーがある場合は更新をスキップする', () => {
    it('同一TickerID+Dateの再実行で更新せずAPI呼び出しをスキップする', async () => {
      await exchangeRepository.create({
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '09:00',
        End: '17:00',
      });
      await tickerRepository.create({
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      });

      const isTradingHoursFn: jest.MockedFunction<typeof isTradingHours> = jest
        .fn()
        .mockReturnValue(false);
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest
        .fn()
        .mockResolvedValueOnce([
          {
            time: Date.UTC(2026, 1, 27),
            open: 100,
            high: 110,
            low: 95,
            close: 108,
            volume: 1000,
          },
        ])
        .mockResolvedValueOnce([
          {
            time: Date.UTC(2026, 1, 27),
            open: 101,
            high: 111,
            low: 96,
            close: 109,
            volume: 1000,
          },
        ]);
      // 2026-02-27 (金曜日) 23:00 UTC = 18:00 ET (取引終了後)
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0));

      await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        isTradingHoursFn,
        getChartDataFn,
        nowFn,
      });
      await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        isTradingHoursFn,
        getChartDataFn,
        nowFn,
      });

      const summaries = await dailySummaryRepository.getByExchange('NASDAQ', '2026-02-27');
      expect(summaries).toHaveLength(1);
      expect(summaries[0].Open).toBe(100);
      expect(summaries[0].Close).toBe(108);
      expect(getChartDataFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('シナリオ3b: 週末実行でも既存サマリーがある場合は更新をスキップする', () => {
    it('土曜日の再実行で金曜日サマリーを更新しない', async () => {
      await exchangeRepository.create({
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '09:00',
        End: '17:00',
      });
      await tickerRepository.create({
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      });

      const isTradingHoursFn: jest.MockedFunction<typeof isTradingHours> = jest
        .fn()
        .mockReturnValue(false);
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 27),
          open: 100,
          high: 110,
          low: 95,
          close: 108,
          volume: 1000,
        },
      ]);
      // 2026-02-28 (土曜日) 12:00 UTC = 07:00 ET → getLastTradingDate = "2026-02-27" (金)
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 28, 12, 0, 0));

      await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        isTradingHoursFn,
        getChartDataFn,
        nowFn,
      });
      await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        isTradingHoursFn,
        getChartDataFn,
        nowFn,
      });

      // 金曜のサマリーが1件のみ、2回目はスキップされている
      const summaries = await dailySummaryRepository.getByExchange('NASDAQ', '2026-02-27');
      expect(summaries).toHaveLength(1);
      expect(summaries[0].Open).toBe(100);
      expect(summaries[0].Close).toBe(108);
      expect(getChartDataFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('シナリオ4: ティッカーレベルのエラー発生時、他のティッカーの処理が継続される', () => {
    it('一部ティッカーでエラーが発生しても他のティッカーは保存される', async () => {
      await exchangeRepository.create({
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '09:00',
        End: '17:00',
      });
      await tickerRepository.create({
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      });
      await tickerRepository.create({
        TickerID: 'NSDQ:NVDA',
        Symbol: 'NVDA',
        Name: 'NVIDIA Corp.',
        ExchangeID: 'NASDAQ',
      });

      const isTradingHoursFn: jest.MockedFunction<typeof isTradingHours> = jest
        .fn()
        .mockReturnValue(false);
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest
        .fn()
        .mockImplementation(async (tickerId) => {
          if (tickerId === 'NSDQ:AAPL') {
            throw new Error('TradingView API Error');
          }

          return [
            {
              time: Date.UTC(2026, 1, 27),
              open: 200,
              high: 220,
              low: 190,
              close: 210,
              volume: 2000,
            },
          ];
        });
      // 2026-02-27 (金曜日) 23:00 UTC = 18:00 ET (取引終了後)
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0));

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        isTradingHoursFn,
        getChartDataFn,
        nowFn,
      });

      expect(response.statusCode).toBe(200);

      const aapl = await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27');
      const nvda = await dailySummaryRepository.getByTickerAndDate('NSDQ:NVDA', '2026-02-27');

      expect(aapl).toBeNull();
      expect(nvda).not.toBeNull();
      expect(nvda).toMatchObject({
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
        Open: 200,
        High: 220,
        Low: 190,
        Close: 210,
      });
    });
  });

  describe('チャートデータが空の場合', () => {
    it('チャートデータが0件ならサマリーを保存しない', async () => {
      await exchangeRepository.create({
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '09:00',
        End: '17:00',
      });
      await tickerRepository.create({
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      });

      const isTradingHoursFn: jest.MockedFunction<typeof isTradingHours> = jest
        .fn()
        .mockReturnValue(false);
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest
        .fn()
        .mockResolvedValue([]);
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0));

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        isTradingHoursFn,
        getChartDataFn,
        nowFn,
      });

      expect(response.statusCode).toBe(200);
      expect(await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27')).toBeNull();
    });
  });

  describe('取引所処理レベルのエラー', () => {
    it('取引所内処理で例外が発生してもレスポンスは200で処理継続する', async () => {
      const response = await handler(mockEvent, {
        exchangeRepository: {
          getAll: jest.fn().mockResolvedValue([
            {
              ExchangeID: 'NASDAQ',
              Name: 'NASDAQ',
              Key: 'NSDQ',
              Timezone: 'America/New_York',
              Start: '09:00',
              End: '17:00',
            },
          ]),
        } as unknown as InMemoryExchangeRepository,
        tickerRepository: {
          getByExchange: jest.fn().mockRejectedValue('ticker fetch failed'),
        } as unknown as InMemoryTickerRepository,
        dailySummaryRepository: dailySummaryRepository as InMemoryDailySummaryRepository,
        isTradingHoursFn: jest.fn().mockReturnValue(false),
        getChartDataFn: jest.fn(),
        nowFn: jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0)),
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('ハンドラーレベルのエラー', () => {
    it('取引所一覧取得で例外が発生した場合は500を返す', async () => {
      const response = await handler(mockEvent, {
        exchangeRepository: {
          getAll: jest.fn().mockRejectedValue('exchange fetch failed'),
        } as unknown as InMemoryExchangeRepository,
        tickerRepository: tickerRepository as InMemoryTickerRepository,
        dailySummaryRepository: dailySummaryRepository as InMemoryDailySummaryRepository,
      });

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body)).toMatchObject({
        message: '日次サマリー生成バッチでエラーが発生しました',
        error: 'exchange fetch failed',
      });
    });
  });
});
