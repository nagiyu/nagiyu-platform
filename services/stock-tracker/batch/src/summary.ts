/**
 * 日次サマリー生成バッチのLambda Handler
 * EventBridge Scheduler から rate(1 hour) で実行される
 */

import { logger } from './lib/logger.js';
import { getDynamoDBDocumentClient, getTableName } from './lib/aws-clients.js';
import {
  DynamoDBDailySummaryRepository,
  DynamoDBExchangeRepository,
  PatternAnalyzer,
  PATTERN_REGISTRY,
  DynamoDBTickerRepository,
  getChartData,
  isTradingHours,
  getLastTradingDate,
} from '@nagiyu/stock-tracker-core';
import type {
  DailySummaryRepository,
  ExchangeEntity,
  ExchangeRepository,
  TickerRepository,
} from '@nagiyu/stock-tracker-core';

/**
 * Lambda Handlerイベント型
 */
export interface ScheduledEvent {
  version: string;
  id: string;
  'detail-type': string;
  source: string;
  account: string;
  time: string;
  region: string;
  resources: string[];
  detail: Record<string, unknown>;
}

/**
 * Lambda Handler レスポンス型
 */
export interface HandlerResponse {
  statusCode: number;
  body: string;
}

/**
 * バッチ処理の統計情報
 */
interface BatchStatistics {
  totalExchanges: number;
  processedExchanges: number;
  skippedTradingExchanges: number;
  totalTickers: number;
  processedTickers: number;
  summariesSaved: number;
  errors: number;
}

interface HandlerDependencies {
  exchangeRepository: ExchangeRepository;
  tickerRepository: TickerRepository;
  dailySummaryRepository: DailySummaryRepository;
  isTradingHoursFn: typeof isTradingHours;
  getChartDataFn: typeof getChartData;
  nowFn: () => number;
}

async function processExchange(
  exchange: ExchangeEntity,
  dependencies: HandlerDependencies,
  stats: BatchStatistics
): Promise<void> {
  try {
    const now = dependencies.nowFn();
    if (dependencies.isTradingHoursFn(exchange, now)) {
      logger.debug('取引時間中のため取引所をスキップします', {
        exchangeId: exchange.ExchangeID,
      });
      stats.skippedTradingExchanges++;
      return;
    }

    const tickerResult = await dependencies.tickerRepository.getByExchange(exchange.ExchangeID);
    const tickers = tickerResult.items;
    stats.totalTickers += tickers.length;
    const summaryDate = getLastTradingDate(exchange, now);
    const patternAnalyzer = new PatternAnalyzer();

    for (const ticker of tickers) {
      try {
        const existingSummary = await dependencies.dailySummaryRepository.getByTickerAndDate(
          ticker.TickerID,
          summaryDate
        );
        if (existingSummary) {
          logger.debug('既存の日次サマリーが存在するためティッカーをスキップします', {
            exchangeId: exchange.ExchangeID,
            tickerId: ticker.TickerID,
            date: summaryDate,
          });
          continue;
        }

        const chartData = await dependencies.getChartDataFn(ticker.TickerID, 'D', {
          count: 50,
          session: 'extended',
        });

        if (chartData.length === 0) {
          logger.warn('チャートデータが0件のためティッカーをスキップします', {
            exchangeId: exchange.ExchangeID,
            tickerId: ticker.TickerID,
          });
          continue;
        }

        const latest = chartData[0];
        const patternAnalysis =
          chartData.length < 50
            ? {
                patternResults: Object.fromEntries(
                  PATTERN_REGISTRY.map((pattern) => [
                    pattern.definition.patternId,
                    'INSUFFICIENT_DATA',
                  ])
                ),
                buyPatternCount: 0,
                sellPatternCount: 0,
              }
            : patternAnalyzer.analyze(chartData);

        await dependencies.dailySummaryRepository.upsert({
          TickerID: ticker.TickerID,
          ExchangeID: exchange.ExchangeID,
          Date: summaryDate,
          Open: latest.open,
          High: latest.high,
          Low: latest.low,
          Close: latest.close,
          PatternResults: patternAnalysis.patternResults,
          BuyPatternCount: patternAnalysis.buyPatternCount,
          SellPatternCount: patternAnalysis.sellPatternCount,
        });

        stats.summariesSaved++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn('ティッカーの日足データ取得に失敗したため、前回結果を維持します', {
          exchangeId: exchange.ExchangeID,
          tickerId: ticker.TickerID,
          executionTime: new Date(now).toISOString(),
          reason: errorMessage,
        });
        stats.errors++;
      } finally {
        stats.processedTickers++;
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('取引所の日次サマリー処理に失敗しました', {
      exchangeId: exchange.ExchangeID,
      error: errorMessage,
    });
    stats.errors++;
  } finally {
    stats.processedExchanges++;
  }
}

/**
 * Lambda Handler
 */
export async function handler(
  event: ScheduledEvent,
  dependencies?: Partial<HandlerDependencies>
): Promise<HandlerResponse> {
  logger.info('日次サマリー生成バッチを開始します', {
    eventId: event.id,
    eventTime: event.time,
  });

  const stats: BatchStatistics = {
    totalExchanges: 0,
    processedExchanges: 0,
    skippedTradingExchanges: 0,
    totalTickers: 0,
    processedTickers: 0,
    summariesSaved: 0,
    errors: 0,
  };

  try {
    let resolvedDependencies: HandlerDependencies;
    if (
      dependencies?.exchangeRepository &&
      dependencies?.tickerRepository &&
      dependencies?.dailySummaryRepository
    ) {
      resolvedDependencies = {
        exchangeRepository: dependencies.exchangeRepository,
        tickerRepository: dependencies.tickerRepository,
        dailySummaryRepository: dependencies.dailySummaryRepository,
        isTradingHoursFn: dependencies.isTradingHoursFn ?? isTradingHours,
        getChartDataFn: dependencies.getChartDataFn ?? getChartData,
        nowFn: dependencies.nowFn ?? Date.now,
      };
    } else {
      const docClient = getDynamoDBDocumentClient();
      const tableName = getTableName();
      resolvedDependencies = {
        exchangeRepository: new DynamoDBExchangeRepository(docClient, tableName),
        tickerRepository: new DynamoDBTickerRepository(docClient, tableName),
        dailySummaryRepository: new DynamoDBDailySummaryRepository(docClient, tableName),
        isTradingHoursFn: dependencies?.isTradingHoursFn ?? isTradingHours,
        getChartDataFn: dependencies?.getChartDataFn ?? getChartData,
        nowFn: dependencies?.nowFn ?? Date.now,
      };
    }

    const exchanges = await resolvedDependencies.exchangeRepository.getAll();
    stats.totalExchanges = exchanges.length;

    for (const exchange of exchanges) {
      await processExchange(exchange, resolvedDependencies, stats);
    }

    logger.info('日次サマリー生成バッチが正常に完了しました', {
      eventId: event.id,
      statistics: stats,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: '日次サマリー生成バッチが正常に完了しました',
        statistics: stats,
      }),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('日次サマリー生成バッチでエラーが発生しました', {
      eventId: event.id,
      error: errorMessage,
      statistics: stats,
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: '日次サマリー生成バッチでエラーが発生しました',
        error: errorMessage,
        statistics: stats,
      }),
    };
  }
}
