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
  getLastTradingDate,
} from '@nagiyu/stock-tracker-core';
import { generateAiAnalysis } from './lib/openai-client.js';
import type { AiAnalysisInput } from './lib/openai-client.js';
import type {
  DailySummaryRepository,
  ExchangeEntity,
  ExchangeRepository,
  PatternResults,
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
  totalTickers: number;
  processedTickers: number;
  summariesSaved: number;
  aiAnalysisGenerated: number;
  aiAnalysisSkipped: number;
  errors: number;
}

interface HandlerDependencies {
  exchangeRepository: ExchangeRepository;
  tickerRepository: TickerRepository;
  dailySummaryRepository: DailySummaryRepository;
  getChartDataFn: typeof getChartData;
  nowFn: () => number;
  generateAiAnalysisFn?: (apiKey: string, input: AiAnalysisInput) => Promise<string>;
}

function needsStaticAnalysis(
  existingSummary: Awaited<ReturnType<DailySummaryRepository['getByTickerAndDate']>>
): boolean {
  if (!existingSummary) {
    return true;
  }

  const hasOhlc =
    existingSummary.Open !== undefined &&
    existingSummary.High !== undefined &&
    existingSummary.Low !== undefined &&
    existingSummary.Close !== undefined;
  if (!hasOhlc) {
    return true;
  }

  const patternResults = existingSummary.PatternResults;
  if (!patternResults) {
    return true;
  }

  return PATTERN_REGISTRY.some(
    (pattern) => patternResults[pattern.definition.patternId] === undefined
  );
}

async function processExchange(
  exchange: ExchangeEntity,
  dependencies: HandlerDependencies,
  stats: BatchStatistics
): Promise<void> {
  try {
    const now = dependencies.nowFn();
    const tickerResult = await dependencies.tickerRepository.getByExchange(exchange.ExchangeID);
    const tickers = tickerResult.items;
    stats.totalTickers += tickers.length;
    const summaryDate = getLastTradingDate(exchange, now);
    const patternAnalyzer = new PatternAnalyzer();

    for (const ticker of tickers) {
      try {
        let currentSummary = await dependencies.dailySummaryRepository.getByTickerAndDate(
          ticker.TickerID,
          summaryDate
        );
        if (needsStaticAnalysis(currentSummary)) {
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
                  ) as PatternResults,
                  buyPatternCount: 0,
                  sellPatternCount: 0,
                }
              : patternAnalyzer.analyze(chartData);

          currentSummary = {
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
            AiAnalysis: currentSummary?.AiAnalysis,
            AiAnalysisError: currentSummary?.AiAnalysisError,
          };
          await dependencies.dailySummaryRepository.upsert(currentSummary);
          stats.summariesSaved++;
        }

        if (currentSummary.AiAnalysis !== undefined) {
          logger.debug('既存の日次サマリーが存在するためティッカーをスキップします', {
            exchangeId: exchange.ExchangeID,
            tickerId: ticker.TickerID,
            date: summaryDate,
          });
          continue;
        }

        const openAiApiKey = process.env.OPENAI_API_KEY;
        if (!openAiApiKey || !dependencies.generateAiAnalysisFn) {
          stats.aiAnalysisSkipped++;
          continue;
        }

        try {
          const matchedPatterns = PATTERN_REGISTRY.filter(
            (pattern) => currentSummary.PatternResults?.[pattern.definition.patternId] === 'MATCHED'
          );
          const aiAnalysis = await dependencies.generateAiAnalysisFn(openAiApiKey, {
            tickerId: ticker.TickerID,
            name: ticker.Name,
            date: summaryDate,
            open: currentSummary.Open,
            high: currentSummary.High,
            low: currentSummary.Low,
            close: currentSummary.Close,
            buyPatternCount: currentSummary.BuyPatternCount ?? 0,
            sellPatternCount: currentSummary.SellPatternCount ?? 0,
            patternSummary: matchedPatterns.map((pattern) => pattern.definition.name).join('、'),
          });

          await dependencies.dailySummaryRepository.upsert({
            ...currentSummary,
            AiAnalysis: aiAnalysis,
            AiAnalysisError: undefined,
          });
          stats.aiAnalysisGenerated++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn('AI解析の生成に失敗したため、エラー情報を保存して処理を継続します', {
            exchangeId: exchange.ExchangeID,
            tickerId: ticker.TickerID,
            reason: errorMessage,
          });
          await dependencies.dailySummaryRepository.upsert({
            ...currentSummary,
            AiAnalysis: undefined,
            AiAnalysisError: errorMessage,
          });
          stats.aiAnalysisSkipped++;
        }
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
    totalTickers: 0,
    processedTickers: 0,
    summariesSaved: 0,
    aiAnalysisGenerated: 0,
    aiAnalysisSkipped: 0,
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
        getChartDataFn: dependencies.getChartDataFn ?? getChartData,
        nowFn: dependencies.nowFn ?? Date.now,
        generateAiAnalysisFn: dependencies.generateAiAnalysisFn ?? generateAiAnalysis,
      };
    } else {
      const docClient = getDynamoDBDocumentClient();
      const tableName = getTableName();
      resolvedDependencies = {
        exchangeRepository: new DynamoDBExchangeRepository(docClient, tableName),
        tickerRepository: new DynamoDBTickerRepository(docClient, tableName),
        dailySummaryRepository: new DynamoDBDailySummaryRepository(docClient, tableName),
        getChartDataFn: dependencies?.getChartDataFn ?? getChartData,
        nowFn: dependencies?.nowFn ?? Date.now,
        generateAiAnalysisFn: dependencies?.generateAiAnalysisFn ?? generateAiAnalysis,
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
