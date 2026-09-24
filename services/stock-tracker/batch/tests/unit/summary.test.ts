/**
 * Unit tests for summary batch processing
 */

import { InMemorySingleTableStore } from '@nagiyu/aws';
import * as awsModule from '@nagiyu/aws';
import {
  DynamoDBExchangeRepository,
  InMemoryDailySummaryRepository,
  InMemoryExchangeRepository,
  InMemoryTickerRepository,
  PATTERN_REGISTRY,
  PatternAnalyzer,
} from '@nagiyu/stock-tracker-core';
import { handler } from '../../src/summary.js';
import type { ScheduledEvent } from '../../src/summary.js';
import { getChartData } from '@nagiyu/stock-tracker-core';
import { logger } from '@nagiyu/common';

describe('summary batch handler', () => {
  let exchangeRepository: InMemoryExchangeRepository;
  let tickerRepository: InMemoryTickerRepository;
  let dailySummaryRepository: InMemoryDailySummaryRepository;
  let mockEvent: ScheduledEvent;

  beforeEach(() => {
    jest.spyOn(awsModule, 'reportErrorEvent').mockResolvedValue(null);

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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('シナリオ1: 取引時間終了済み取引所のサマリーが生成される', () => {
    it('count:100 で取得し PatternAnalyzer の結果を保存する', async () => {
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

      const analyzeSpy = jest.spyOn(PatternAnalyzer.prototype, 'analyze').mockReturnValue({
        patternResults: {
          'morning-star': 'MATCHED',
          'evening-star': 'NOT_MATCHED',
        },
        buyPatternCount: 1,
        sellPatternCount: 0,
      });
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue(
        Array.from({ length: 100 }, (_, index) => ({
          time: Date.UTC(2026, 1, 27 - index, 14, 30, 0),
          open: 100 + index,
          high: 110 + index,
          low: 95 + index,
          close: 108 + index,
          volume: 1000 + index,
        }))
      );
      // 2026-02-27 (金曜日) 23:00 UTC = 18:00 ET (取引終了後)
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0));

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn,
      });

      expect(response.statusCode).toBe(200);
      expect(getChartDataFn).toHaveBeenCalledWith('NSDQ:AAPL', 'D', {
        count: 105,
        session: 'extended',
      });
      expect(analyzeSpy).toHaveBeenCalledTimes(1);

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
        Volume: 1000,
        PatternResults: {
          'morning-star': 'MATCHED',
          'evening-star': 'NOT_MATCHED',
        },
        BuyPatternCount: 1,
        SellPatternCount: 0,
      });
    });
  });

  describe('シナリオ1b: 取得件数が100本未満の場合', () => {
    it('PatternAnalyzer を呼ばず全パターンを INSUFFICIENT_DATA として保存する', async () => {
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

      const analyzeSpy = jest.spyOn(PatternAnalyzer.prototype, 'analyze');
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 27, 14, 30, 0),
          open: 100,
          high: 110,
          low: 95,
          close: 108,
          volume: 1000,
        },
      ]);
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0));

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn,
      });

      expect(response.statusCode).toBe(200);
      expect(analyzeSpy).not.toHaveBeenCalled();

      const summary = await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27');
      expect(summary).not.toBeNull();
      expect(summary).toMatchObject({
        PatternResults: Object.fromEntries(
          PATTERN_REGISTRY.map((pattern) => [pattern.definition.patternId, 'INSUFFICIENT_DATA'])
        ),
        BuyPatternCount: 0,
        SellPatternCount: 0,
      });
    });
  });

  describe('シナリオ1c: 日足データ取得失敗時', () => {
    it('warn ログを出力して前回結果を未更新のままにする（FR-011）', async () => {
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
      await dailySummaryRepository.upsert({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-26',
        Open: 100,
        High: 110,
        Low: 95,
        Close: 108,
        PatternResults: {
          'morning-star': 'MATCHED',
          'evening-star': 'NOT_MATCHED',
        },
        BuyPatternCount: 1,
        SellPatternCount: 0,
      });

      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest
        .fn()
        .mockRejectedValue(new Error('TradingView API Error'));
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 28, 23, 0, 0));

      const response = await handler(
        {
          ...mockEvent,
          time: '2026-02-28T23:00:00Z',
        },
        {
          exchangeRepository,
          tickerRepository,
          dailySummaryRepository,
          getChartDataFn,
          nowFn,
        }
      );

      expect(response.statusCode).toBe(200);
      expect(warnSpy).toHaveBeenCalledWith(
        'ティッカーの日足データ取得に失敗したため、前回結果を維持します',
        expect.objectContaining({
          tickerId: 'NSDQ:AAPL',
          executionTime: '2026-02-28T23:00:00.000Z',
          reason: 'TradingView API Error',
        })
      );
      expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({ serviceId: 'stock-tracker', severity: 'warning' })
      );

      const summary = await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-26');
      expect(summary).toMatchObject({
        Open: 100,
        High: 110,
        Low: 95,
        Close: 108,
        PatternResults: {
          'morning-star': 'MATCHED',
          'evening-star': 'NOT_MATCHED',
        },
        BuyPatternCount: 1,
        SellPatternCount: 0,
      });
      expect(await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27')).toBeNull();
    });
  });

  describe('シナリオ2: 取引時間中でも前回取引日のサマリーは生成される', () => {
    it('取引時間中は getLastTradingDate で算出された前回取引日でサマリーを生成する', async () => {
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
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 26, 14, 30, 0),
          open: 100,
          high: 110,
          low: 95,
          close: 108,
          volume: 1000,
        },
      ]);
      // 2026-02-27 15:00 UTC = 10:00 ET（取引時間中） -> 前回取引日 2026-02-26
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 27, 15, 0, 0));

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn,
      });

      expect(response.statusCode).toBe(200);
      expect(getChartDataFn).toHaveBeenCalledTimes(1);

      const summaries = await dailySummaryRepository.getByExchange('NASDAQ', '2026-02-26');
      expect(summaries).toHaveLength(1);
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
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest
        .fn()
        .mockResolvedValueOnce([
          {
            time: Date.UTC(2026, 1, 27, 14, 30, 0),
            open: 100,
            high: 110,
            low: 95,
            close: 108,
            volume: 1000,
          },
        ])
        .mockResolvedValueOnce([
          {
            time: Date.UTC(2026, 1, 27, 14, 30, 0),
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
        getChartDataFn,
        nowFn,
      });
      await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
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

  describe('シナリオ3a: 既存サマリーにパターン分析結果がない場合は更新する', () => {
    it('同一TickerID+Dateでもパターン分析未保存なら再生成して保存する', async () => {
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
      await dailySummaryRepository.upsert({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 90,
        High: 95,
        Low: 88,
        Close: 92,
      });

      const analyzeSpy = jest.spyOn(PatternAnalyzer.prototype, 'analyze').mockReturnValue({
        patternResults: {
          'morning-star': 'MATCHED',
          'evening-star': 'NOT_MATCHED',
        },
        buyPatternCount: 1,
        sellPatternCount: 0,
      });
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue(
        Array.from({ length: 100 }, (_, index) => ({
          time: Date.UTC(2026, 1, 27 - index, 14, 30, 0),
          open: 100 + index,
          high: 110 + index,
          low: 95 + index,
          close: 108 + index,
          volume: 1000 + index,
        }))
      );
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0));

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn,
      });

      expect(response.statusCode).toBe(200);
      expect(getChartDataFn).toHaveBeenCalledTimes(1);
      expect(analyzeSpy).toHaveBeenCalledTimes(1);
      expect(
        await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27')
      ).toMatchObject({
        Open: 100,
        High: 110,
        Low: 95,
        Close: 108,
        PatternResults: {
          'morning-star': 'MATCHED',
          'evening-star': 'NOT_MATCHED',
        },
        BuyPatternCount: 1,
        SellPatternCount: 0,
      });
    });
  });

  describe('シナリオ3c: 既存サマリーに一部パターン結果が欠ける場合は更新する', () => {
    it('PATTERN_REGISTRY のいずれかが欠損していれば再解析して保存する', async () => {
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

      // 最後の1パターンを意図的に欠損させる
      const incompletePatternResults = Object.fromEntries(
        PATTERN_REGISTRY.slice(0, -1).map((pattern) => [
          pattern.definition.patternId,
          'NOT_MATCHED',
        ])
      );
      await dailySummaryRepository.upsert({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 90,
        High: 95,
        Low: 88,
        Close: 92,
        PatternResults: incompletePatternResults,
        BuyPatternCount: 0,
        SellPatternCount: 0,
      });

      const analyzeSpy = jest.spyOn(PatternAnalyzer.prototype, 'analyze').mockReturnValue({
        patternResults: Object.fromEntries(
          PATTERN_REGISTRY.map((pattern) => [pattern.definition.patternId, 'NOT_MATCHED'])
        ),
        buyPatternCount: 0,
        sellPatternCount: 0,
      });
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue(
        Array.from({ length: 100 }, (_, index) => ({
          time: Date.UTC(2026, 1, 27 - index, 14, 30, 0),
          open: 100 + index,
          high: 110 + index,
          low: 95 + index,
          close: 108 + index,
          volume: 1000 + index,
        }))
      );

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn: jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0)),
      });

      expect(response.statusCode).toBe(200);
      expect(getChartDataFn).toHaveBeenCalledTimes(1);
      expect(analyzeSpy).toHaveBeenCalledTimes(1);
      expect(
        await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27')
      ).toMatchObject({
        PatternResults: Object.fromEntries(
          PATTERN_REGISTRY.map((pattern) => [pattern.definition.patternId, 'NOT_MATCHED'])
        ),
      });
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
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 27, 14, 30, 0),
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
        getChartDataFn,
        nowFn,
      });
      await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
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
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest
        .fn()
        .mockImplementation(async (tickerId) => {
          if (tickerId === 'NSDQ:AAPL') {
            throw new Error('TradingView API Error');
          }

          return [
            {
              time: Date.UTC(2026, 1, 27, 14, 30, 0),
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

  describe('シナリオ4b: 51件以上のティッカーがある取引所でも全銘柄が処理される（Issue #3788）', () => {
    it('totalTickers が全ティッカー数になり、全ティッカーのサマリーが保存される', async () => {
      await exchangeRepository.create({
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '09:00',
        End: '17:00',
      });

      const total = 51;
      for (let i = 0; i < total; i += 1) {
        await tickerRepository.create({
          TickerID: `NSDQ:T${String(i).padStart(4, '0')}`,
          Symbol: `T${String(i).padStart(4, '0')}`,
          Name: `Test ${i}`,
          ExchangeID: 'NASDAQ',
        });
      }

      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 27, 14, 30, 0),
          open: 200,
          high: 220,
          low: 190,
          close: 210,
          volume: 2000,
        },
      ]);
      // 2026-02-27 (金曜日) 23:00 UTC = 18:00 ET (取引終了後)
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0));

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn,
      });
      const body = JSON.parse(response.body) as {
        statistics: { totalTickers: number; processedTickers: number };
      };

      expect(response.statusCode).toBe(200);
      expect(body.statistics.totalTickers).toBe(total);
      expect(body.statistics.processedTickers).toBe(total);

      const summaries = await dailySummaryRepository.getByExchange('NASDAQ', '2026-02-27');
      expect(summaries).toHaveLength(total);
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
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest
        .fn()
        .mockResolvedValue([]);
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0));

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn,
      });

      expect(response.statusCode).toBe(200);
      expect(await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27')).toBeNull();
    });
  });

  describe('休場日・進行中バー対応（Issue #3830）', () => {
    it('祝日（最新足の日付がsummaryDateより前）はサマリーを作成しない', async () => {
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
      // summaryDate は 2026-02-27（祝日で休場）。チャートの最新足は前営業日 2026-02-26 のまま
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 26, 14, 30, 0),
          open: 100,
          high: 110,
          low: 95,
          close: 108,
          volume: 1000,
        },
      ]);
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
      // 2026-02-27 (金) 23:00 UTC = 18:00 ET (祝日でも取引終了時刻は過ぎている想定)
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0));

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn,
      });

      expect(response.statusCode).toBe(200);
      expect(await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27')).toBeNull();
      const body = JSON.parse(response.body);
      expect(body.statistics.skippedNoBarForDate).toBe(1);
      expect(body.statistics.summariesSaved).toBe(0);
      expect(infoSpy).toHaveBeenCalledWith(
        'summaryDate に一致する取引日の足が見つからないためサマリー生成をスキップします',
        expect.objectContaining({
          tickerId: 'NSDQ:AAPL',
          summaryDate: '2026-02-27',
          latestBarDate: '2026-02-26',
        })
      );
    });

    it('翌日の取引中（先頭が進行中の足）でも summaryDate の足を採用し、分析入力に含めない', async () => {
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

      const analyzeSpy = jest.spyOn(PatternAnalyzer.prototype, 'analyze').mockReturnValue({
        patternResults: {
          'morning-star': 'MATCHED',
          'evening-star': 'NOT_MATCHED',
        },
        buyPatternCount: 1,
        sellPatternCount: 0,
      });

      // 先頭 (index 0) が summaryDate (2026-02-27) より後の進行中の足。
      // バッチ障害で翌営業日の取引時間中にずれ込んで実行されたケースを再現する。
      const inProgressBar = {
        time: Date.UTC(2026, 1, 28, 14, 30, 0),
        open: 200,
        high: 205,
        low: 198,
        close: 201,
        volume: 500,
      };
      const settledBars = Array.from({ length: 100 }, (_, index) => ({
        time: Date.UTC(2026, 1, 27 - index, 14, 30, 0),
        open: 100 + index,
        high: 110 + index,
        low: 95 + index,
        close: 108 + index,
        volume: 1000 + index,
      }));
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest
        .fn()
        .mockResolvedValue([inProgressBar, ...settledBars]);
      // summaryDate は 2026-02-27 のまま（例: getLastTradingDate 算出時点と実行時点がずれた）
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0));

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn,
      });

      expect(response.statusCode).toBe(200);
      expect(analyzeSpy).toHaveBeenCalledTimes(1);
      // 進行中の足(inProgressBar)を含まない、summaryDate 以前の100本で解析していること
      const analyzedCandles = analyzeSpy.mock.calls[0][0];
      expect(analyzedCandles).toHaveLength(100);
      expect(analyzedCandles).not.toContain(inProgressBar);
      expect(analyzedCandles[0]).toBe(settledBars[0]);

      const summary = await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27');
      expect(summary).toMatchObject({
        Open: settledBars[0].open,
        High: settledBars[0].high,
        Low: settledBars[0].low,
        Close: settledBars[0].close,
        Volume: settledBars[0].volume,
      });
    });
  });

  describe('取引所単位の休場日打ち切り（Issue #3830）', () => {
    const missBar = {
      time: Date.UTC(2026, 1, 26, 14, 30, 0), // 前営業日の足のみ（summaryDate=2026-02-27の足なし）
      open: 100,
      high: 110,
      low: 95,
      close: 108,
      volume: 1000,
    };
    const hitBar = {
      time: Date.UTC(2026, 1, 27, 14, 30, 0), // summaryDate の足あり
      open: 101,
      high: 111,
      low: 96,
      close: 109,
      volume: 1100,
    };
    // 2026-02-27 (金) 23:00 UTC = 18:00 ET (取引終了後) → summaryDate = 2026-02-27
    const nowFn = jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0));

    async function setupExchangeWithTickers(tickerCount: number): Promise<void> {
      await exchangeRepository.create({
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '09:00',
        End: '17:00',
      });
      for (let i = 1; i <= tickerCount; i++) {
        await tickerRepository.create({
          TickerID: `NSDQ:T${i}`,
          Symbol: `T${i}`,
          Name: `Test ${i}`,
          ExchangeID: 'NASDAQ',
        });
      }
    }

    it('先頭から連続3件が足なしなら4件目以降は getChartData を呼ばず打ち切る', async () => {
      await setupExchangeWithTickers(4);
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest
        .fn()
        .mockResolvedValue([missBar]);
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn,
      });

      expect(response.statusCode).toBe(200);
      expect(getChartDataFn).toHaveBeenCalledTimes(3);
      expect(getChartDataFn).not.toHaveBeenCalledWith('NSDQ:T4', 'D', expect.anything());
      const body = JSON.parse(response.body);
      expect(body.statistics.skippedNoBarForDate).toBe(3);
      expect(body.statistics.skippedExchangesAsClosed).toBe(1);
      expect(body.statistics.processedTickers).toBe(3);
      expect(infoSpy).toHaveBeenCalledWith(
        '先頭から連続して summaryDate の足が見つからないため、取引所を休場日とみなし残りのティッカー処理を打ち切ります',
        expect.objectContaining({
          exchangeId: 'NASDAQ',
          summaryDate: '2026-02-27',
          consecutiveMisses: 3,
        })
      );
    });

    it('2件目で足ありが見つかれば、その後3件連続で足なしでも打ち切らない', async () => {
      await setupExchangeWithTickers(4);
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest
        .fn()
        .mockImplementation(async (tickerId: string) => {
          return tickerId === 'NSDQ:T2' ? [hitBar] : [missBar];
        });

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn,
      });

      expect(response.statusCode).toBe(200);
      expect(getChartDataFn).toHaveBeenCalledTimes(4);
      const body = JSON.parse(response.body);
      expect(body.statistics.skippedExchangesAsClosed).toBe(0);
      expect(body.statistics.summariesSaved).toBe(1);
      expect(body.statistics.skippedNoBarForDate).toBe(3);
      expect(body.statistics.processedTickers).toBe(4);
    });

    it('ティッカーが閾値未満の取引所では打ち切らない', async () => {
      await setupExchangeWithTickers(2);
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest
        .fn()
        .mockResolvedValue([missBar]);

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn,
      });

      expect(response.statusCode).toBe(200);
      expect(getChartDataFn).toHaveBeenCalledTimes(2);
      const body = JSON.parse(response.body);
      expect(body.statistics.skippedExchangesAsClosed).toBe(0);
      expect(body.statistics.skippedNoBarForDate).toBe(2);
      expect(body.statistics.processedTickers).toBe(2);
    });

    it('既存サマリーがありチャートを取得しなかったティッカーは打ち切り判定にカウントしない', async () => {
      await setupExchangeWithTickers(5);
      // T1 は既存サマリーが完備しているためチャート取得をスキップする（打ち切り判定の対象外）
      await dailySummaryRepository.upsert({
        TickerID: 'NSDQ:T1',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 90,
        High: 95,
        Low: 88,
        Close: 92,
        PatternResults: Object.fromEntries(
          PATTERN_REGISTRY.map((pattern) => [pattern.definition.patternId, 'NOT_MATCHED'])
        ),
        BuyPatternCount: 0,
        SellPatternCount: 0,
        AiAnalysisResult: {
          priceMovementAnalysis: 'test',
          patternAnalysis: 'test',
          supportLevels: [1, 2, 3],
          resistanceLevels: [4, 5, 6],
          relatedMarketTrend: 'test',
          investmentJudgment: { signal: 'NEUTRAL', reason: 'test' },
        },
      });

      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest
        .fn()
        .mockResolvedValue([missBar]);

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn,
      });

      expect(response.statusCode).toBe(200);
      // T1 はチャート取得しない。T2〜T4 で3件連続の足なしとなり、T5 は処理されずに打ち切られる
      expect(getChartDataFn).toHaveBeenCalledTimes(3);
      expect(getChartDataFn).not.toHaveBeenCalledWith('NSDQ:T5', 'D', expect.anything());
      const body = JSON.parse(response.body);
      expect(body.statistics.skippedExchangesAsClosed).toBe(1);
      expect(body.statistics.processedTickers).toBe(4);
    });
  });

  describe('TSE（Asia/Tokyo）の足の日付判定（Issue #3830）', () => {
    // TSE の日足は当日 00:00Z 付近で配信される想定（Asia/Tokyo は UTC+9 のためオフセットなし）
    it('祝日（最新足の日付がsummaryDateより前）はサマリーを作成しない', async () => {
      await exchangeRepository.create({
        ExchangeID: 'TSE',
        Name: 'Tokyo Stock Exchange',
        Key: 'TSE',
        Timezone: 'Asia/Tokyo',
        Start: '09:00',
        End: '15:00',
      });
      await tickerRepository.create({
        TickerID: 'TSE:7203',
        Symbol: '7203',
        Name: 'Toyota Motor Corp.',
        ExchangeID: 'TSE',
      });

      // summaryDate は 2026-02-27（祝日で休場）。チャートの最新足は前営業日 2026-02-26 のまま
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 26, 0, 0, 0), // 2026-02-26 09:00 JST
          open: 3000,
          high: 3050,
          low: 2980,
          close: 3020,
          volume: 500000,
        },
      ]);
      // 2026-02-27 (金) 07:00 UTC = 16:00 JST（取引終了後）
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 27, 7, 0, 0));

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn,
      });

      expect(response.statusCode).toBe(200);
      expect(await dailySummaryRepository.getByTickerAndDate('TSE:7203', '2026-02-27')).toBeNull();
      const body = JSON.parse(response.body);
      expect(body.statistics.skippedNoBarForDate).toBe(1);
      expect(body.statistics.summariesSaved).toBe(0);
    });

    it('通常日は summaryDate の足を採用してサマリーを保存する', async () => {
      await exchangeRepository.create({
        ExchangeID: 'TSE',
        Name: 'Tokyo Stock Exchange',
        Key: 'TSE',
        Timezone: 'Asia/Tokyo',
        Start: '09:00',
        End: '15:00',
      });
      await tickerRepository.create({
        TickerID: 'TSE:7203',
        Symbol: '7203',
        Name: 'Toyota Motor Corp.',
        ExchangeID: 'TSE',
      });

      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 27, 0, 0, 0), // 2026-02-27 09:00 JST（summaryDate の足）
          open: 3010,
          high: 3060,
          low: 2990,
          close: 3040,
          volume: 520000,
        },
      ]);
      // 2026-02-27 (金) 07:00 UTC = 16:00 JST（取引終了後）→ summaryDate = 2026-02-27
      const nowFn = jest.fn(() => Date.UTC(2026, 1, 27, 7, 0, 0));

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn,
      });

      expect(response.statusCode).toBe(200);
      const summary = await dailySummaryRepository.getByTickerAndDate('TSE:7203', '2026-02-27');
      expect(summary).toMatchObject({
        Open: 3010,
        High: 3060,
        Low: 2990,
        Close: 3040,
        Volume: 520000,
      });
    });
  });

  describe('AI解析処理', () => {
    const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
    const mockAiAnalysisResult = {
      priceMovementAnalysis: '当日の値動き分析',
      patternAnalysis: 'パターン分析',
      supportLevels: [100, 99, 98] as [number, number, number],
      resistanceLevels: [110, 111, 112] as [number, number, number],
      relatedMarketTrend: '関連市場動向',
      investmentJudgment: {
        signal: 'NEUTRAL' as const,
        reason: '様子見',
      },
    };

    beforeEach(async () => {
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
    });

    afterEach(() => {
      if (originalOpenAiApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalOpenAiApiKey;
      }
    });

    it('generateAiAnalysisFn の成功時に aiAnalysisGenerated が増加する', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';

      const generateAiAnalysisFn = jest.fn().mockResolvedValue(mockAiAnalysisResult);
      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn: jest.fn().mockResolvedValue([
          {
            time: Date.UTC(2026, 1, 27, 14, 30, 0),
            open: 100,
            high: 110,
            low: 95,
            close: 108,
            volume: 1000,
          },
        ]),
        nowFn: jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0)),
        generateAiAnalysisFn,
      });

      expect(response.statusCode).toBe(200);
      expect(generateAiAnalysisFn).toHaveBeenCalledTimes(1);
      expect(generateAiAnalysisFn).toHaveBeenCalledWith(
        'test-api-key',
        expect.objectContaining({
          tickerId: 'NSDQ:AAPL',
          name: 'Apple Inc.',
          date: '2026-02-27',
          volume: 1000,
        })
      );
      expect(
        await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27')
      ).toMatchObject({
        AiAnalysisResult: mockAiAnalysisResult,
      });
      expect(JSON.parse(response.body).statistics).toMatchObject({
        aiAnalysisGenerated: 1,
        aiAnalysisSkipped: 0,
      });
    });

    it('静的解析時は chartData から過去データを作成して AI 入力に含める', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';

      const generateAiAnalysisFn = jest.fn().mockResolvedValue(mockAiAnalysisResult);
      const createChartImageBase64Fn = jest
        .fn()
        .mockReturnValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA');

      await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn: jest.fn().mockResolvedValue([
          {
            time: Date.UTC(2026, 1, 27, 14, 30, 0),
            open: 100,
            high: 110,
            low: 95,
            close: 108,
            volume: 1000,
          },
        ]),
        createChartImageBase64Fn,
        nowFn: jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0)),
        generateAiAnalysisFn,
      });

      expect(createChartImageBase64Fn).toHaveBeenCalledWith([
        {
          date: '2026-02-27',
          open: 100,
          high: 110,
          low: 95,
          close: 108,
          volume: 1000,
        },
      ]);
      expect(generateAiAnalysisFn).toHaveBeenCalledWith(
        'test-api-key',
        expect.objectContaining({
          historicalData: expect.arrayContaining([
            expect.objectContaining({
              date: '2026-02-27',
            }),
          ]),
          chartImageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA',
        })
      );
    });

    it('既存サマリー再利用時でもchartDataから過去データを取得する', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';

      await dailySummaryRepository.upsert({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 90,
        High: 95,
        Low: 88,
        Close: 92,
        PatternResults: Object.fromEntries(
          PATTERN_REGISTRY.map((pattern) => [pattern.definition.patternId, 'NOT_MATCHED'])
        ),
        BuyPatternCount: 0,
        SellPatternCount: 0,
      });

      const generateAiAnalysisFn = jest.fn().mockResolvedValue(mockAiAnalysisResult);
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 27, 14, 30, 0),
          open: 100,
          high: 110,
          low: 95,
          close: 108,
          volume: 1000,
        },
      ]);

      await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn,
        createChartImageBase64Fn: jest.fn().mockReturnValue(undefined),
        nowFn: jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0)),
        generateAiAnalysisFn,
      });

      expect(getChartDataFn).toHaveBeenCalledWith('NSDQ:AAPL', 'D', {
        count: 55,
        session: 'extended',
      });
      expect(generateAiAnalysisFn).toHaveBeenCalledWith(
        'test-api-key',
        expect.objectContaining({
          historicalData: [
            {
              date: '2026-02-27',
              open: 100,
              high: 110,
              low: 95,
              close: 108,
              volume: 1000,
            },
          ],
          chartImageBase64: undefined,
        })
      );
    });

    it('AI解析用chartData取得失敗時はAI解析をスキップする', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';

      await dailySummaryRepository.upsert({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 90,
        High: 95,
        Low: 88,
        Close: 92,
        PatternResults: Object.fromEntries(
          PATTERN_REGISTRY.map((pattern) => [pattern.definition.patternId, 'NOT_MATCHED'])
        ),
        BuyPatternCount: 0,
        SellPatternCount: 0,
      });

      const generateAiAnalysisFn = jest.fn().mockResolvedValue(mockAiAnalysisResult);

      await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn: jest.fn().mockRejectedValue(new Error('chart api error')),
        createChartImageBase64Fn: jest.fn().mockReturnValue(undefined),
        nowFn: jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0)),
        generateAiAnalysisFn,
      });

      expect(generateAiAnalysisFn).not.toHaveBeenCalled();
      expect(
        await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27')
      ).toMatchObject({
        AiAnalysisResult: undefined,
      });
    });

    it('AI解析用chartData が空の場合でも historicalData を空配列にして AI 解析を実行する', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';

      const matchedPatternId = PATTERN_REGISTRY[0].definition.patternId;
      const matchedPatternName = PATTERN_REGISTRY[0].definition.name;

      await dailySummaryRepository.upsert({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 90,
        High: 95,
        Low: 88,
        Close: 92,
        PatternResults: Object.fromEntries(
          PATTERN_REGISTRY.map((pattern) => [
            pattern.definition.patternId,
            pattern.definition.patternId === matchedPatternId ? 'MATCHED' : 'NOT_MATCHED',
          ])
        ),
        BuyPatternCount: 1,
        SellPatternCount: 0,
      });

      const generateAiAnalysisFn = jest.fn().mockResolvedValue(mockAiAnalysisResult);
      // needsStaticAnalysis が false のため、AI解析用の chartData 取得が走る（count: 50）
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest
        .fn()
        .mockResolvedValue([]);

      await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn: jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0)),
        generateAiAnalysisFn,
      });

      expect(generateAiAnalysisFn).toHaveBeenCalledWith(
        'test-api-key',
        expect.objectContaining({
          historicalData: [],
          patternSummary: expect.stringContaining(matchedPatternName),
        })
      );
    });

    it('チャート画像生成失敗時は画像なしで AI 解析を継続する', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';

      const generateAiAnalysisFn = jest.fn().mockResolvedValue(mockAiAnalysisResult);

      await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn: jest.fn().mockResolvedValue([
          {
            time: Date.UTC(2026, 1, 27, 14, 30, 0),
            open: 100,
            high: 110,
            low: 95,
            close: 108,
            volume: 1000,
          },
        ]),
        createChartImageBase64Fn: jest.fn(() => {
          throw new Error('chart render error');
        }),
        nowFn: jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0)),
        generateAiAnalysisFn,
      });

      expect(generateAiAnalysisFn).toHaveBeenCalledWith(
        'test-api-key',
        expect.objectContaining({
          chartImageBase64: undefined,
        })
      );
    });

    it('generateAiAnalysisFn が失敗した場合に aiAnalysisSkipped が増加し AiAnalysisError を保存する', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';

      const generateAiAnalysisFn = jest.fn().mockRejectedValue(new Error('OpenAI API Error'));
      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn: jest.fn().mockResolvedValue([
          {
            time: Date.UTC(2026, 1, 27, 14, 30, 0),
            open: 100,
            high: 110,
            low: 95,
            close: 108,
            volume: 1000,
          },
        ]),
        nowFn: jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0)),
        generateAiAnalysisFn,
      });

      expect(response.statusCode).toBe(200);
      expect(
        await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27')
      ).toMatchObject({
        AiAnalysisError: 'OpenAI API Error',
      });
      expect(JSON.parse(response.body).statistics).toMatchObject({
        aiAnalysisGenerated: 0,
        aiAnalysisSkipped: 1,
        errors: 0,
      });
    });

    it('OPENAI_API_KEY 未設定時は AI 解析をスキップする', async () => {
      delete process.env.OPENAI_API_KEY;

      const generateAiAnalysisFn = jest.fn().mockResolvedValue(mockAiAnalysisResult);
      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn: jest.fn().mockResolvedValue([
          {
            time: Date.UTC(2026, 1, 27, 14, 30, 0),
            open: 100,
            high: 110,
            low: 95,
            close: 108,
            volume: 1000,
          },
        ]),
        nowFn: jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0)),
        generateAiAnalysisFn,
      });

      expect(response.statusCode).toBe(200);
      expect(generateAiAnalysisFn).not.toHaveBeenCalled();
      expect(JSON.parse(response.body).statistics).toMatchObject({
        aiAnalysisGenerated: 0,
        aiAnalysisSkipped: 1,
      });
    });

    it('AiAnalysisResult が既存値ありの場合は再生成しない', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';

      await dailySummaryRepository.upsert({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 90,
        High: 95,
        Low: 88,
        Close: 92,
        PatternResults: Object.fromEntries(
          PATTERN_REGISTRY.map((pattern) => [pattern.definition.patternId, 'NOT_MATCHED'])
        ),
        BuyPatternCount: 0,
        SellPatternCount: 0,
        AiAnalysisResult: mockAiAnalysisResult,
      });

      const generateAiAnalysisFn = jest.fn().mockResolvedValue({
        ...mockAiAnalysisResult,
        investmentJudgment: { signal: 'BULLISH' as const, reason: '上昇基調' },
      });
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 27, 14, 30, 0),
          open: 100,
          high: 110,
          low: 95,
          close: 108,
          volume: 1000,
        },
      ]);
      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn: jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0)),
        generateAiAnalysisFn,
      });

      expect(response.statusCode).toBe(200);
      expect(getChartDataFn).not.toHaveBeenCalled();
      expect(generateAiAnalysisFn).not.toHaveBeenCalled();
      expect(
        await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27')
      ).toMatchObject({
        AiAnalysisResult: mockAiAnalysisResult,
      });
    });

    it('静的解析済みかつ AiAnalysisResult 未設定なら AI 解析のみ実行する', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';

      await dailySummaryRepository.upsert({
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 90,
        High: 95,
        Low: 88,
        Close: 92,
        PatternResults: Object.fromEntries(
          PATTERN_REGISTRY.map((pattern) => [pattern.definition.patternId, 'NOT_MATCHED'])
        ),
        BuyPatternCount: 0,
        SellPatternCount: 0,
      });

      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 27, 14, 30, 0),
          open: 100,
          high: 110,
          low: 95,
          close: 108,
          volume: 1000,
        },
      ]);
      const generateAiAnalysisFn = jest.fn().mockResolvedValue({
        ...mockAiAnalysisResult,
        investmentJudgment: { signal: 'BEARISH' as const, reason: '下落リスク' },
      });

      const response = await handler(mockEvent, {
        exchangeRepository,
        tickerRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn: jest.fn(() => Date.UTC(2026, 1, 27, 23, 0, 0)),
        generateAiAnalysisFn,
      });

      expect(response.statusCode).toBe(200);
      expect(getChartDataFn).toHaveBeenCalledWith('NSDQ:AAPL', 'D', {
        count: 55,
        session: 'extended',
      });
      expect(generateAiAnalysisFn).toHaveBeenCalledTimes(1);
      expect(
        await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27')
      ).toMatchObject({
        Open: 90,
        High: 95,
        Low: 88,
        Close: 92,
        AiAnalysisResult: expect.objectContaining({
          investmentJudgment: expect.objectContaining({ signal: 'BEARISH' }),
        }),
      });
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

  describe('DynamoDB 初期化分岐', () => {
    it('dependencies を省略した場合、DynamoDB から初期化する', async () => {
      jest.spyOn(awsModule, 'getDynamoDBDocumentClient').mockReturnValue({} as never);
      jest.spyOn(awsModule, 'getTableName').mockReturnValue('test-table');
      jest.spyOn(DynamoDBExchangeRepository.prototype, 'getAll').mockResolvedValue([]);

      const response = await handler(mockEvent);

      expect(response.statusCode).toBe(200);
      expect(awsModule.getDynamoDBDocumentClient).toHaveBeenCalled();
      expect(awsModule.getTableName).toHaveBeenCalled();
    });
  });
});
