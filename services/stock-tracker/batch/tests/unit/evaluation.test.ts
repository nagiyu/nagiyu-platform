/**
 * Unit tests for the evaluation batch handler
 */

import { EntityAlreadyExistsError, InMemorySingleTableStore } from '@nagiyu/aws';
import * as awsModule from '@nagiyu/aws';
import { logger } from '@nagiyu/common';
import {
  InMemoryDailySummaryRepository,
  InMemoryExchangeRepository,
} from '@nagiyu/stock-tracker-core';
import type {
  AiAnalysisResult,
  CreateDailySummaryInput,
  DailySummaryRepository,
  getChartData,
} from '@nagiyu/stock-tracker-core';
import { handler, type ScheduledEvent } from '../../src/evaluation.js';
import type { PendingEvaluation } from '../../src/lib/find-pending-evaluations.js';

const NOW = Date.UTC(2026, 1, 27, 23, 0, 0); // 2026-02-27 (金) 18:00 EST

function buildEvent(): ScheduledEvent {
  return {
    version: '0',
    id: 'evaluation-test',
    'detail-type': 'Scheduled Event',
    source: 'aws.events',
    account: '123456789012',
    time: '2026-02-27T23:00:00Z',
    region: 'ap-northeast-1',
    resources: ['arn:aws:events:ap-northeast-1:123456789012:rule/test'],
    detail: {},
  };
}

function baseAiResult(signal: 'BULLISH' | 'NEUTRAL' | 'BEARISH' = 'BULLISH'): AiAnalysisResult {
  return {
    priceMovementAnalysis: 'test',
    patternAnalysis: 'test',
    supportLevels: [90, 85, 80],
    resistanceLevels: [110, 115, 120],
    relatedMarketTrend: 'test',
    investmentJudgment: {
      signal,
      reason: 'test',
    },
  };
}

function summaryInput(override: Partial<CreateDailySummaryInput> = {}): CreateDailySummaryInput {
  return {
    TickerID: 'NSDQ:AAPL',
    ExchangeID: 'NASDAQ',
    Date: '2026-02-26',
    Open: 100,
    High: 110,
    Low: 95,
    Close: 100,
    Volume: 1000,
    AiAnalysisResult: baseAiResult('BULLISH'),
    ...override,
  };
}

describe('evaluation batch handler', () => {
  let store: InMemorySingleTableStore;
  let exchangeRepository: InMemoryExchangeRepository;
  let dailySummaryRepository: InMemoryDailySummaryRepository;

  beforeEach(async () => {
    store = new InMemorySingleTableStore();
    exchangeRepository = new InMemoryExchangeRepository(store);
    dailySummaryRepository = new InMemoryDailySummaryRepository(store);

    await exchangeRepository.create({
      ExchangeID: 'NASDAQ',
      Name: 'NASDAQ',
      Key: 'NSDQ',
      Timezone: 'America/New_York',
      Start: '09:00',
      End: '17:00',
    });
  });

  beforeEach(() => {
    jest.spyOn(awsModule, 'reportErrorEvent').mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('正常系', () => {
    it('採点対象に Evaluation* を書き込む（BULLISH × +0.5% 以上 → Hit）', async () => {
      // 基準終値 100、翌営業日終値 105 → +5.0% → BULLISH Hit
      await dailySummaryRepository.upsert(
        summaryInput({
          Close: 100,
          AiAnalysisResult: baseAiResult('BULLISH'),
        })
      );

      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 26, 14, 30, 0), // 2026-02-26 09:30 EST（予測日＝基準日の足）
          open: 99,
          high: 101,
          low: 98,
          close: 100,
          volume: 1900,
        },
        {
          time: Date.UTC(2026, 1, 27, 14, 30, 0), // 2026-02-27 09:30 EST
          open: 103,
          high: 106,
          low: 102,
          close: 105,
          volume: 2000,
        },
      ]);

      const response = await handler(buildEvent(), {
        exchangeRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn: () => NOW,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics).toMatchObject({
        totalCandidates: 1,
        evaluated: 1,
        alreadyEvaluatedSkipped: 0,
        missingClose: 0,
        missingBaseBar: 0,
        failed: 0,
      });

      const updated = await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-26');
      expect(updated?.EvaluationDate).toBe('2026-02-27');
      expect(updated?.EvaluationClose).toBe(105);
      expect(updated?.ActualReturn).toBeCloseTo(5, 5);
      expect(updated?.Hit).toBe(true);
      expect(updated?.EvaluationThresholdPercent).toBe(0.5);
      expect(updated?.EvaluatedAt).toBe(NOW);
    });

    it('BEARISH 予測 × 下落で Hit', async () => {
      await dailySummaryRepository.upsert(
        summaryInput({
          Close: 100,
          AiAnalysisResult: baseAiResult('BEARISH'),
        })
      );

      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 26, 14, 30, 0), // 予測日＝基準日の足
          open: 99,
          high: 101,
          low: 98,
          close: 100,
          volume: 1900,
        },
        {
          time: Date.UTC(2026, 1, 27, 14, 30, 0),
          open: 99,
          high: 100,
          low: 95,
          close: 95,
          volume: 1500,
        },
      ]);

      const response = await handler(buildEvent(), {
        exchangeRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn: () => NOW,
      });

      expect(response.statusCode).toBe(200);
      const updated = await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-26');
      expect(updated?.Hit).toBe(true);
      expect(updated?.ActualReturn).toBeCloseTo(-5, 5);
    });

    it('NEUTRAL 予測 × ボラ小で Hit', async () => {
      await dailySummaryRepository.upsert(
        summaryInput({
          Close: 100,
          AiAnalysisResult: baseAiResult('NEUTRAL'),
        })
      );

      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 26, 14, 30, 0), // 予測日＝基準日の足
          open: 99,
          high: 101,
          low: 98,
          close: 100,
          volume: 1900,
        },
        {
          time: Date.UTC(2026, 1, 27, 14, 30, 0),
          open: 100,
          high: 101,
          low: 99.8,
          close: 100.2,
          volume: 1500,
        },
      ]);

      await handler(buildEvent(), {
        exchangeRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn: () => NOW,
      });

      const updated = await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-26');
      expect(updated?.Hit).toBe(true);
      expect(updated?.ActualReturn).toBeCloseTo(0.2, 5);
    });
  });

  describe('基準日の足がチャートに無い場合', () => {
    it('summary.Close へはフォールバックせず採点をスキップする（休場日コピー足の可能性）', async () => {
      await dailySummaryRepository.upsert(
        summaryInput({
          Close: 100,
          AiAnalysisResult: baseAiResult('BULLISH'),
        })
      );

      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
      // チャートには翌営業日の足しか含まれず、予測日（基準日）の足は含まれない
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 27, 14, 30, 0),
          open: 103,
          high: 106,
          low: 102,
          close: 105,
          volume: 2000,
        },
      ]);

      const response = await handler(buildEvent(), {
        exchangeRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn: () => NOW,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.missingBaseBar).toBe(1);
      expect(body.statistics.evaluated).toBe(0);

      const updated = await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-26');
      expect(updated?.EvaluatedAt).toBeUndefined();
      expect(infoSpy).toHaveBeenCalledWith(
        '予測日の足がチャートに存在しない（休場日の可能性）ため採点しません',
        expect.objectContaining({ tickerId: 'NSDQ:AAPL', date: '2026-02-26' })
      );
    });
  });

  describe('祝日・株式分割対応（Issue #3830）', () => {
    it('翌平日が祝日でも、実データ上の次の足（2日後）で採点される', async () => {
      // 予測日 2026-02-25（水）、翌日 2026-02-26（木）が祝日で休場、
      // 実際の次の取引日は 2026-02-27（金）
      await dailySummaryRepository.upsert(
        summaryInput({
          Date: '2026-02-25',
          Close: 100,
          AiAnalysisResult: baseAiResult('BULLISH'),
        })
      );

      // チャートには祝日の足は存在せず、予測日(2026-02-25)と 2026-02-27 の足のみが現れる
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 25, 14, 30, 0), // 2026-02-25 09:30 EST（予測日＝基準日の足）
          open: 99,
          high: 101,
          low: 98,
          close: 100,
          volume: 1900,
        },
        {
          time: Date.UTC(2026, 1, 27, 14, 30, 0), // 2026-02-27 09:30 EST
          open: 101,
          high: 104,
          low: 100,
          close: 103,
          volume: 1800,
        },
      ]);

      const response = await handler(buildEvent(), {
        exchangeRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn: () => NOW,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.evaluated).toBe(1);
      expect(body.statistics.missingClose).toBe(0);
      expect(body.statistics.missingBaseBar).toBe(0);

      const updated = await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-25');
      // 祝日 2026-02-26 を飛ばして 2026-02-27 が評価日として確定する
      expect(updated?.EvaluationDate).toBe('2026-02-27');
      expect(updated?.EvaluationClose).toBe(103);
      expect(updated?.ActualReturn).toBeCloseTo(3, 5);
    });

    it('次の足の日付が lastTradingDate より後（まだ引けていない）場合は次回に回す', async () => {
      const candidate: PendingEvaluation = {
        summary: {
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Date: '2026-02-25',
          Open: 100,
          High: 110,
          Low: 95,
          Close: 100,
          AiAnalysisResult: baseAiResult('BULLISH'),
          CreatedAt: 0,
          UpdatedAt: 0,
        },
        exchange: {
          ExchangeID: 'NASDAQ',
          Name: 'NASDAQ',
          Key: 'NSDQ',
          Timezone: 'America/New_York',
          Start: '09:00',
          End: '17:00',
          CreatedAt: 0,
          UpdatedAt: 0,
        },
        // 抽出時点の直近完了取引日は 2026-02-26 だが、チャート上の次の足は 2026-02-27 で
        // まだ引けていない（進行中）扱いになるケースを再現する
        lastTradingDate: '2026-02-26',
      };
      const findPendingEvaluationsFn = jest
        .fn<Promise<PendingEvaluation[]>, never[]>()
        .mockResolvedValue([candidate]);
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 27, 14, 30, 0), // 2026-02-27（lastTradingDate より後）
          open: 101,
          high: 104,
          low: 100,
          close: 103,
          volume: 1800,
        },
      ]);

      const response = await handler(buildEvent(), {
        exchangeRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn: () => NOW,
        findPendingEvaluationsFn: findPendingEvaluationsFn as never,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.missingClose).toBe(1);
      expect(body.statistics.evaluated).toBe(0);
    });

    it('株式分割をまたいでも、チャート上の基準日の終値で ActualReturn を計算する', async () => {
      // 保存済み summary.Close は分割前の値(100)。分割後、チャート上の同じ日の終値は
      // 調整済みの値(50)になっている想定
      await dailySummaryRepository.upsert(
        summaryInput({
          Date: '2026-02-25',
          Close: 100,
          AiAnalysisResult: baseAiResult('BULLISH'),
        })
      );

      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          // 予測日 2026-02-25 の足（分割調整後の終値 50）
          time: Date.UTC(2026, 1, 25, 14, 30, 0),
          open: 49,
          high: 51,
          low: 48,
          close: 50,
          volume: 4000,
        },
        {
          // 翌営業日 2026-02-26 の足（分割調整後の終値 52）
          time: Date.UTC(2026, 1, 26, 14, 30, 0),
          open: 50,
          high: 53,
          low: 49,
          close: 52,
          volume: 4200,
        },
      ]);

      // 2026-02-26（木）18:00 EST（取引終了後）→ lastTradingDate = 2026-02-26
      const now = Date.UTC(2026, 1, 26, 23, 0, 0);

      const response = await handler(buildEvent(), {
        exchangeRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn: () => now,
      });

      expect(response.statusCode).toBe(200);
      const updated = await dailySummaryRepository.getByTickerAndDate('NSDQ:AAPL', '2026-02-25');
      expect(updated?.EvaluationDate).toBe('2026-02-26');
      expect(updated?.EvaluationClose).toBe(52);
      // 分割調整後の基準終値50を使うため (52-50)/50*100 = 4%（分割前Close=100基準なら-48%になってしまう）
      expect(updated?.ActualReturn).toBeCloseTo(4, 5);
      expect(updated?.Hit).toBe(true);
    });
  });

  describe('スキップ / 失敗ハンドリング', () => {
    it('翌営業日終値がチャートに無い場合は missingClose にカウントし継続', async () => {
      await dailySummaryRepository.upsert(summaryInput({ Close: 100 }));

      // 別日のバーしか返さない
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 25, 14, 30, 0),
          open: 95,
          high: 98,
          low: 94,
          close: 97,
          volume: 1000,
        },
      ]);

      const response = await handler(buildEvent(), {
        exchangeRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn: () => NOW,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.missingClose).toBe(1);
      expect(body.statistics.evaluated).toBe(0);

      const stillUnevaluated = await dailySummaryRepository.getByTickerAndDate(
        'NSDQ:AAPL',
        '2026-02-26'
      );
      expect(stillUnevaluated?.EvaluatedAt).toBeUndefined();
    });

    it('TradingView エラーは failed にカウントし他の予測の処理を継続', async () => {
      await dailySummaryRepository.upsert(summaryInput({ Date: '2026-02-25' }));
      await dailySummaryRepository.upsert(summaryInput({ Date: '2026-02-26', Close: 100 }));

      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('TradingView API 失敗');
        })
        .mockResolvedValueOnce([
          {
            time: Date.UTC(2026, 1, 26, 14, 30, 0), // 予測日＝基準日の足
            open: 99,
            high: 101,
            low: 98,
            close: 100,
            volume: 1900,
          },
          {
            time: Date.UTC(2026, 1, 27, 14, 30, 0),
            open: 103,
            high: 106,
            low: 102,
            close: 105,
            volume: 2000,
          },
        ]);

      const response = await handler(buildEvent(), {
        exchangeRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn: () => NOW,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.totalCandidates).toBe(2);
      expect(body.statistics.failed).toBe(1);
      expect(body.statistics.evaluated).toBe(1);
      expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({ serviceId: 'stock-tracker', severity: 'warning' })
      );
    });

    it('ConditionalCheck 違反（並列実行による既採点）は alreadyEvaluatedSkipped にカウント', async () => {
      const repositoryStub: DailySummaryRepository = {
        ...dailySummaryRepository,
        getByTickerAndDate: dailySummaryRepository.getByTickerAndDate.bind(dailySummaryRepository),
        getByExchange: dailySummaryRepository.getByExchange.bind(dailySummaryRepository),
        getByExchangeAndDateRange:
          dailySummaryRepository.getByExchangeAndDateRange.bind(dailySummaryRepository),
        upsert: dailySummaryRepository.upsert.bind(dailySummaryRepository),
        markAsEvaluated: jest.fn(() => {
          throw new EntityAlreadyExistsError('DailySummaryEvaluation', 'NSDQ:AAPL#2026-02-26');
        }),
      };

      await dailySummaryRepository.upsert(summaryInput({ Close: 100 }));

      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 26, 14, 30, 0), // 予測日＝基準日の足
          open: 99,
          high: 101,
          low: 98,
          close: 100,
          volume: 1900,
        },
        {
          time: Date.UTC(2026, 1, 27, 14, 30, 0),
          open: 103,
          high: 106,
          low: 102,
          close: 105,
          volume: 2000,
        },
      ]);

      const response = await handler(buildEvent(), {
        exchangeRepository,
        dailySummaryRepository: repositoryStub,
        getChartDataFn,
        nowFn: () => NOW,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.alreadyEvaluatedSkipped).toBe(1);
      expect(body.statistics.evaluated).toBe(0);
    });

    it('書き込み時の汎用エラーは failed にカウントし継続', async () => {
      const repositoryStub: DailySummaryRepository = {
        ...dailySummaryRepository,
        getByTickerAndDate: dailySummaryRepository.getByTickerAndDate.bind(dailySummaryRepository),
        getByExchange: dailySummaryRepository.getByExchange.bind(dailySummaryRepository),
        getByExchangeAndDateRange:
          dailySummaryRepository.getByExchangeAndDateRange.bind(dailySummaryRepository),
        upsert: dailySummaryRepository.upsert.bind(dailySummaryRepository),
        markAsEvaluated: jest.fn(() => {
          throw new Error('DynamoDB throttling');
        }),
      };

      await dailySummaryRepository.upsert(summaryInput({ Close: 100 }));

      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 26, 14, 30, 0), // 予測日＝基準日の足
          open: 99,
          high: 101,
          low: 98,
          close: 100,
          volume: 1900,
        },
        {
          time: Date.UTC(2026, 1, 27, 14, 30, 0),
          open: 103,
          high: 106,
          low: 102,
          close: 105,
          volume: 2000,
        },
      ]);

      const response = await handler(buildEvent(), {
        exchangeRepository,
        dailySummaryRepository: repositoryStub,
        getChartDataFn,
        nowFn: () => NOW,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.failed).toBe(1);
      expect(body.statistics.evaluated).toBe(0);
    });
  });

  describe('防御的フィルタ', () => {
    it('findPendingEvaluations が AiAnalysisResult 欠損の候補を返した場合は failed として継続', async () => {
      const candidate: PendingEvaluation = {
        summary: {
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Date: '2026-02-26',
          Open: 100,
          High: 110,
          Low: 95,
          Close: 100,
          AiAnalysisResult: undefined,
          CreatedAt: 0,
          UpdatedAt: 0,
        },
        exchange: {
          ExchangeID: 'NASDAQ',
          Name: 'NASDAQ',
          Key: 'NSDQ',
          Timezone: 'America/New_York',
          Start: '09:00',
          End: '17:00',
          CreatedAt: 0,
          UpdatedAt: 0,
        },
        lastTradingDate: '2026-02-27',
      };
      const findPendingEvaluationsFn = jest
        .fn<Promise<PendingEvaluation[]>, never[]>()
        .mockResolvedValue([candidate]);
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn();

      const response = await handler(buildEvent(), {
        exchangeRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn: () => NOW,
        findPendingEvaluationsFn: findPendingEvaluationsFn as never,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.failed).toBe(1);
      expect(body.statistics.evaluated).toBe(0);
      expect(getChartDataFn).not.toHaveBeenCalled();
    });

    it('judgePrediction のエラー（基準終値 0）は failed として継続', async () => {
      await dailySummaryRepository.upsert(summaryInput({ Close: 0 }));

      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn().mockResolvedValue([
        {
          time: Date.UTC(2026, 1, 26, 14, 30, 0), // 予測日＝基準日の足（Close 0 のまま）
          open: 0,
          high: 0,
          low: 0,
          close: 0,
          volume: 0,
        },
        {
          time: Date.UTC(2026, 1, 27, 14, 30, 0),
          open: 1,
          high: 2,
          low: 0.5,
          close: 1,
          volume: 100,
        },
      ]);

      const response = await handler(buildEvent(), {
        exchangeRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn: () => NOW,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.failed).toBe(1);
      expect(body.statistics.evaluated).toBe(0);
    });
  });

  describe('空状態', () => {
    it('採点対象がない場合は no-op で 200 を返す', async () => {
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn();

      const response = await handler(buildEvent(), {
        exchangeRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn: () => NOW,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics).toMatchObject({
        totalCandidates: 0,
        evaluated: 0,
        failed: 0,
      });
      expect(getChartDataFn).not.toHaveBeenCalled();
    });
  });

  describe('全体エラー', () => {
    it('findPendingEvaluations が例外を投げた場合は 500 を返す', async () => {
      const getChartDataFn: jest.MockedFunction<typeof getChartData> = jest.fn();
      const failingFinder = jest.fn(() => {
        throw new Error('exchange repository unreachable');
      });

      const response = await handler(buildEvent(), {
        exchangeRepository,
        dailySummaryRepository,
        getChartDataFn,
        nowFn: () => NOW,
        findPendingEvaluationsFn: failingFinder as never,
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('採点バッチでエラー');
    });
  });

  describe('DynamoDB 初期化分岐', () => {
    it('exchangeRepository / dailySummaryRepository を省略した場合、DynamoDB から初期化する', async () => {
      jest.spyOn(awsModule, 'getDynamoDBDocumentClient').mockReturnValue({} as never);
      jest.spyOn(awsModule, 'getTableName').mockReturnValue('test-table');

      const response = await handler(buildEvent(), {
        nowFn: () => NOW,
        findPendingEvaluationsFn: jest.fn().mockResolvedValue([]),
      });

      expect(response.statusCode).toBe(200);
      expect(awsModule.getDynamoDBDocumentClient).toHaveBeenCalled();
      expect(awsModule.getTableName).toHaveBeenCalled();
    });
  });
});
