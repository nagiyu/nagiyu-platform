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
      time: '2026-02-28T13:00:00Z',
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
          time: Date.UTC(2026, 1, 28),
          open: 100,
          high: 110,
          low: 95,
          close: 108,
          volume: 1000,
        },
      ]);
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 28, 12, 0, 0));

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
        count: 1,
        session: 'extended',
      });

      const summaries = await dailySummaryRepository.getByExchange('NASDAQ', '2026-02-28');
      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toMatchObject({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-28',
        Open: 100,
        High: 110,
        Low: 95,
        Close: 108,
      });
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
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 28, 12, 0, 0));

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

  describe('シナリオ3: DailySummaryRepository.upsert() が正しく呼び出される（冪等性）', () => {
    it('同一TickerID+Dateの再実行で重複せず上書きされる', async () => {
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
            time: Date.UTC(2026, 1, 28),
            open: 100,
            high: 110,
            low: 95,
            close: 108,
            volume: 1000,
          },
        ])
        .mockResolvedValueOnce([
          {
            time: Date.UTC(2026, 1, 28),
            open: 101,
            high: 111,
            low: 96,
            close: 109,
            volume: 1000,
          },
        ]);
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

      const summaries = await dailySummaryRepository.getByExchange('NASDAQ', '2026-02-28');
      expect(summaries).toHaveLength(1);
      expect(summaries[0].Open).toBe(101);
      expect(summaries[0].Close).toBe(109);
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
              time: Date.UTC(2026, 1, 28),
              open: 200,
              high: 220,
              low: 190,
              close: 210,
              volume: 2000,
            },
          ];
        });
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 28, 12, 0, 0));

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        isTradingHoursFn,
        getChartDataFn,
        nowFn,
      });

      expect(response.statusCode).toBe(200);

      const aapl = await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-28');
      const nvda = await dailySummaryRepository.getByTickerAndDate('NSDQ:NVDA', '2026-02-28');

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
});
