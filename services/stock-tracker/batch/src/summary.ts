/**
 * 日次サマリー生成バッチのLambda Handler
 * EventBridge Scheduler から rate(1 hour) で実行される
 */

import { logger, toErrorMessage } from '@nagiyu/common';
import { getDynamoDBDocumentClient, getTableName, reportErrorEvent } from '@nagiyu/aws';
import {
  DynamoDBDailySummaryRepository,
  DynamoDBExchangeRepository,
  PatternAnalyzer,
  PATTERN_REGISTRY,
  DynamoDBTickerRepository,
  formatDateInTimezone,
  getChartData,
  getLastTradingDate,
} from '@nagiyu/stock-tracker-core';
import { generateAiAnalysis } from './lib/openai-client.js';
import type { AiAnalysisInput } from './lib/openai-client.js';
import { createChartImageBase64 } from './lib/chart-renderer.js';
import type {
  AiAnalysisResult,
  CreateDailySummaryInput,
  DailySummaryEntity,
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
  /** summaryDate に一致する取引日の足が見つからず（休場日 等）サマリー生成をスキップした件数 */
  skippedNoBarForDate: number;
  errors: number;
}

interface HandlerDependencies {
  exchangeRepository: ExchangeRepository;
  tickerRepository: TickerRepository;
  dailySummaryRepository: DailySummaryRepository;
  getChartDataFn: typeof getChartData;
  createChartImageBase64Fn: typeof createChartImageBase64;
  nowFn: () => number;
  generateAiAnalysisFn?: (apiKey: string, input: AiAnalysisInput) => Promise<AiAnalysisResult>;
}

const REQUIRED_CHART_DATA_COUNT = 100;
const AI_ANALYSIS_HISTORY_COUNT = 50;

/**
 * チャートデータの取得件数に持たせる余裕本数
 *
 * バッチ障害等でサマリー生成が翌営業日の取引時間中にずれ込むと、`chartData[0]` が
 * summaryDate より後の進行中の足になる。これを summaryDate 以前の足に絞り込んだ後も
 * REQUIRED_CHART_DATA_COUNT / AI_ANALYSIS_HISTORY_COUNT 分の本数を確保できるよう、
 * 取得時点で余裕を持たせておく。
 */
const CHART_DATA_FETCH_MARGIN = 5;

/**
 * チャートデータのうち、取引所タイムゾーン基準で dateYmd 以前（当日含む）の足だけを返す
 *
 * chartData は新しい順（先頭が最新）に並んでいる前提。翌営業日の取引時間中にバッチが
 * 実行された場合等、先頭が dateYmd より後の進行中の足になっているケースを除外する。
 */
function filterChartDataOnOrBefore(
  chartData: Awaited<ReturnType<typeof getChartData>>,
  timezone: string,
  dateYmd: string
): Awaited<ReturnType<typeof getChartData>> {
  return chartData.filter((point) => formatDateInTimezone(point.time, timezone) <= dateYmd);
}

function toHistoricalDataFromChartData(
  chartData: Awaited<ReturnType<typeof getChartData>>
): AiAnalysisInput['historicalData'] {
  if (chartData.length === 0) {
    return [];
  }

  return chartData.slice(0, AI_ANALYSIS_HISTORY_COUNT).map((point) => ({
    date: new Date(point.time).toISOString().slice(0, 10),
    open: point.open,
    high: point.high,
    low: point.low,
    close: point.close,
    volume: point.volume,
  }));
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

function toCreateDailySummaryInput(summary: DailySummaryEntity): CreateDailySummaryInput {
  return {
    TickerID: summary.TickerID,
    ExchangeID: summary.ExchangeID,
    Date: summary.Date,
    Open: summary.Open,
    High: summary.High,
    Low: summary.Low,
    Close: summary.Close,
    Volume: summary.Volume,
    PatternResults: summary.PatternResults,
    BuyPatternCount: summary.BuyPatternCount,
    SellPatternCount: summary.SellPatternCount,
    AiAnalysisResult: summary.AiAnalysisResult,
    AiAnalysisError: summary.AiAnalysisError,
  };
}

async function processExchange(
  exchange: ExchangeEntity,
  dependencies: HandlerDependencies,
  stats: BatchStatistics
): Promise<void> {
  try {
    const now = dependencies.nowFn();
    // 全件、内部でページを辿り切る（Issue #3788: 51件目以降の打ち切り防止）
    const tickers = await dependencies.tickerRepository.getByExchange(exchange.ExchangeID);
    stats.totalTickers += tickers.length;
    const summaryDate = getLastTradingDate(exchange, now);
    const patternAnalyzer = new PatternAnalyzer();

    for (const ticker of tickers) {
      try {
        const existingSummary = await dependencies.dailySummaryRepository.getByTickerAndDate(
          ticker.TickerID,
          summaryDate
        );
        let currentSummaryInput: CreateDailySummaryInput;
        let historicalDataForAiFromChart: AiAnalysisInput['historicalData'] | undefined;

        if (needsStaticAnalysis(existingSummary)) {
          const chartData = await dependencies.getChartDataFn(ticker.TickerID, 'D', {
            count: REQUIRED_CHART_DATA_COUNT + CHART_DATA_FETCH_MARGIN,
            session: 'extended',
          });

          if (chartData.length === 0) {
            logger.warn('チャートデータが0件のためティッカーをスキップします', {
              exchangeId: exchange.ExchangeID,
              tickerId: ticker.TickerID,
            });
            stats.skippedNoBarForDate++;
            continue;
          }

          // summaryDate より後（翌営業日の進行中の足 等）を除外し、summaryDate 以前の足だけを対象にする
          const onOrBeforeSummaryDate = filterChartDataOnOrBefore(
            chartData,
            exchange.Timezone,
            summaryDate
          );

          if (
            onOrBeforeSummaryDate.length === 0 ||
            formatDateInTimezone(onOrBeforeSummaryDate[0].time, exchange.Timezone) !== summaryDate
          ) {
            // 休場日（祝日等）、またはまだ当日分のデータが反映されていない
            logger.info(
              'summaryDate に一致する取引日の足が見つからないためサマリー生成をスキップします',
              {
                exchangeId: exchange.ExchangeID,
                tickerId: ticker.TickerID,
                summaryDate,
              }
            );
            stats.skippedNoBarForDate++;
            continue;
          }

          const latest = onOrBeforeSummaryDate[0];
          const patternCandles = onOrBeforeSummaryDate.slice(0, REQUIRED_CHART_DATA_COUNT);
          const patternAnalysis =
            patternCandles.length < REQUIRED_CHART_DATA_COUNT
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
              : patternAnalyzer.analyze(patternCandles);

          currentSummaryInput = {
            TickerID: ticker.TickerID,
            ExchangeID: exchange.ExchangeID,
            Date: summaryDate,
            Open: latest.open,
            High: latest.high,
            Low: latest.low,
            Close: latest.close,
            Volume: latest.volume,
            PatternResults: patternAnalysis.patternResults,
            BuyPatternCount: patternAnalysis.buyPatternCount,
            SellPatternCount: patternAnalysis.sellPatternCount,
            AiAnalysisResult: existingSummary?.AiAnalysisResult,
            AiAnalysisError: existingSummary?.AiAnalysisError,
          };
          historicalDataForAiFromChart = toHistoricalDataFromChartData(onOrBeforeSummaryDate);
          await dependencies.dailySummaryRepository.upsert(currentSummaryInput);
          stats.summariesSaved++;
        } else if (existingSummary) {
          currentSummaryInput = toCreateDailySummaryInput(existingSummary);
        } else {
          continue;
        }

        if (currentSummaryInput.AiAnalysisResult !== undefined) {
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
            (pattern) =>
              currentSummaryInput.PatternResults?.[pattern.definition.patternId] === 'MATCHED'
          );
          let historicalData: AiAnalysisInput['historicalData'] =
            historicalDataForAiFromChart ?? [];
          if (historicalDataForAiFromChart === undefined) {
            try {
              const chartDataForAi = await dependencies.getChartDataFn(ticker.TickerID, 'D', {
                count: AI_ANALYSIS_HISTORY_COUNT + CHART_DATA_FETCH_MARGIN,
                session: 'extended',
              });
              const onOrBeforeSummaryDateForAi = filterChartDataOnOrBefore(
                chartDataForAi,
                exchange.Timezone,
                summaryDate
              );
              historicalData = toHistoricalDataFromChartData(onOrBeforeSummaryDateForAi);
            } catch (error) {
              const errorMessage = toErrorMessage(error);
              logger.warn(
                'AI解析用チャートデータの取得に失敗したため、当日データのみでAI解析を継続します',
                {
                  exchangeId: exchange.ExchangeID,
                  tickerId: ticker.TickerID,
                  reason: errorMessage,
                }
              );
              await reportErrorEvent({
                serviceId: 'stock-tracker',
                severity: 'warning',
                title: 'サマリーバッチ: AI解析用チャートデータ取得失敗',
                message: errorMessage,
                context: {
                  exchangeId: exchange.ExchangeID,
                  tickerId: ticker.TickerID,
                  errorStack: error instanceof Error ? error.stack : undefined,
                },
              });
              stats.aiAnalysisSkipped++;
              continue;
            }
          }

          let chartImageBase64: string | undefined;
          try {
            chartImageBase64 = dependencies.createChartImageBase64Fn(historicalData);
          } catch (error) {
            const errorMessage = toErrorMessage(error);
            logger.warn('チャート画像生成に失敗したため、画像なしでAI解析を継続します', {
              exchangeId: exchange.ExchangeID,
              tickerId: ticker.TickerID,
              reason: errorMessage,
            });
          }

          const aiAnalysis = await dependencies.generateAiAnalysisFn(openAiApiKey, {
            tickerId: ticker.TickerID,
            name: ticker.Name,
            date: summaryDate,
            open: currentSummaryInput.Open,
            high: currentSummaryInput.High,
            low: currentSummaryInput.Low,
            close: currentSummaryInput.Close,
            volume: currentSummaryInput.Volume,
            buyPatternCount: currentSummaryInput.BuyPatternCount ?? 0,
            sellPatternCount: currentSummaryInput.SellPatternCount ?? 0,
            patternSummary: matchedPatterns.map((pattern) => pattern.definition.name).join('、'),
            historicalData,
            chartImageBase64,
          });

          await dependencies.dailySummaryRepository.upsert({
            ...currentSummaryInput,
            AiAnalysisResult: aiAnalysis,
            AiAnalysisError: undefined,
          });
          stats.aiAnalysisGenerated++;
        } catch (error) {
          const errorMessage = toErrorMessage(error);
          logger.warn('AI解析の生成に失敗したため、エラー情報を保存して処理を継続します', {
            exchangeId: exchange.ExchangeID,
            tickerId: ticker.TickerID,
            reason: errorMessage,
          });
          await reportErrorEvent({
            serviceId: 'stock-tracker',
            severity: 'warning',
            title: 'サマリーバッチ: AI解析生成失敗',
            message: errorMessage,
            context: {
              exchangeId: exchange.ExchangeID,
              tickerId: ticker.TickerID,
              errorStack: error instanceof Error ? error.stack : undefined,
            },
          });
          await dependencies.dailySummaryRepository.upsert({
            ...currentSummaryInput,
            AiAnalysisResult: undefined,
            AiAnalysisError: errorMessage,
          });
          stats.aiAnalysisSkipped++;
        }
      } catch (error) {
        const errorMessage = toErrorMessage(error);
        logger.warn('ティッカーの日足データ取得に失敗したため、前回結果を維持します', {
          exchangeId: exchange.ExchangeID,
          tickerId: ticker.TickerID,
          executionTime: new Date(now).toISOString(),
          reason: errorMessage,
        });
        await reportErrorEvent({
          serviceId: 'stock-tracker',
          severity: 'warning',
          title: 'サマリーバッチ: ティッカー日足データ取得失敗',
          message: errorMessage,
          context: {
            exchangeId: exchange.ExchangeID,
            tickerId: ticker.TickerID,
            errorStack: error instanceof Error ? error.stack : undefined,
          },
        });
        stats.errors++;
      } finally {
        stats.processedTickers++;
      }
    }
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    logger.error('取引所の日次サマリー処理に失敗しました', {
      exchangeId: exchange.ExchangeID,
      error: errorMessage,
    });
    await reportErrorEvent({
      serviceId: 'stock-tracker',
      severity: 'error',
      title: 'サマリーバッチ: 取引所サマリー処理失敗',
      message: errorMessage,
      context: {
        exchangeId: exchange.ExchangeID,
        errorStack: error instanceof Error ? error.stack : undefined,
      },
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
    skippedNoBarForDate: 0,
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
        createChartImageBase64Fn: dependencies.createChartImageBase64Fn ?? createChartImageBase64,
        nowFn: dependencies.nowFn ?? Date.now,
        generateAiAnalysisFn: dependencies.generateAiAnalysisFn ?? generateAiAnalysis,
      };
    } else {
      const docClient = getDynamoDBDocumentClient();
      const tableName = getTableName();
      const dailySummaryRepository = new DynamoDBDailySummaryRepository(docClient, tableName);
      resolvedDependencies = {
        exchangeRepository: new DynamoDBExchangeRepository(docClient, tableName),
        tickerRepository: new DynamoDBTickerRepository(docClient, tableName),
        dailySummaryRepository,
        getChartDataFn: dependencies?.getChartDataFn ?? getChartData,
        createChartImageBase64Fn: dependencies?.createChartImageBase64Fn ?? createChartImageBase64,
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
    const errorMessage = toErrorMessage(error);
    logger.error('日次サマリー生成バッチでエラーが発生しました', {
      eventId: event.id,
      error: errorMessage,
      statistics: stats,
    });
    await reportErrorEvent({
      serviceId: 'stock-tracker',
      severity: 'error',
      title: 'サマリーバッチ: 致命的エラー',
      message: errorMessage,
      context: { eventId: event.id, statistics: stats },
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
