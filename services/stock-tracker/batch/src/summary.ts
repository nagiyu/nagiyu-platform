/**
 * 日次サマリー生成バッチのLambda Handler
 * EventBridge Scheduler から rate(1 hour) で実行される
 */

import { InvokeCommand } from '@aws-sdk/client-lambda';
import { logger, toErrorMessage } from '@nagiyu/common';
import {
  createScheduledHandler,
  getDynamoDBDocumentClient,
  getLambdaClient,
  getTableName,
  reportErrorEvent,
} from '@nagiyu/aws';
import type { HandlerResponse, ScheduledEvent } from '@nagiyu/aws';
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
import type {
  CreateDailySummaryInput,
  DailySummaryRepository,
  ExchangeEntity,
  ExchangeRepository,
  PatternResults,
  TickerRepository,
} from '@nagiyu/stock-tracker-core';

/**
 * バッチ処理の統計情報
 */
interface BatchStatistics {
  totalExchanges: number;
  processedExchanges: number;
  totalTickers: number;
  processedTickers: number;
  summariesSaved: number;
  /** summaryDate に一致する取引日の足が見つからず（休場日 等）サマリー生成をスキップした件数 */
  skippedNoBarForDate: number;
  /**
   * 取引所単位で休場日とみなし、残りのティッカー処理をこの回打ち切った回数
   *
   * （先頭から連続 EXCHANGE_CLOSED_CONSECUTIVE_MISS_THRESHOLD 件が「summaryDate の足なし」
   * だった取引所の数）
   */
  skippedExchangesAsClosed: number;
  errors: number;
}

interface HandlerDependencies {
  exchangeRepository: ExchangeRepository;
  tickerRepository: TickerRepository;
  dailySummaryRepository: DailySummaryRepository;
  getChartDataFn: typeof getChartData;
  nowFn: () => number;
  /** テスト時に forecast バッチの非同期起動を差し替えるためのフック */
  invokeForecastBatchFn: () => Promise<void>;
}

/**
 * forecast バッチ（確度算出）の Lambda 関数名。
 *
 * summary バッチの完了時に非同期起動するため、STOCK_TRACKER_FORECAST_BATCH_FUNCTION_NAME
 * で明示的に渡す（未設定時は NODE_ENV から dev/prod を推定する）。
 */
function getForecastBatchFunctionName(): string {
  if (process.env.STOCK_TRACKER_FORECAST_BATCH_FUNCTION_NAME) {
    return process.env.STOCK_TRACKER_FORECAST_BATCH_FUNCTION_NAME;
  }
  const envName = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
  return `nagiyu-stock-tracker-batch-forecast-${envName}`;
}

/**
 * forecast バッチを非同期起動する（毎時の起動を待たずに、サマリーができた直後に
 * 確度算出へ進められるようにするため）。
 *
 * サマリーの保存・表示は確度算出の失敗の影響を受けない方針と同様に、起動の失敗も
 * サマリー生成自体の成否に影響させたくないため、ここで例外を握りつぶし警告ログのみ出す。
 */
async function invokeForecastBatch(): Promise<void> {
  try {
    await getLambdaClient().send(
      new InvokeCommand({
        FunctionName: getForecastBatchFunctionName(),
        InvocationType: 'Event',
      })
    );
  } catch (error) {
    logger.warn('確度算出バッチの起動に失敗しました', { reason: toErrorMessage(error) });
  }
}

const REQUIRED_CHART_DATA_COUNT = 100;

/**
 * チャートデータの取得件数に持たせる余裕本数
 *
 * バッチ障害等でサマリー生成が翌営業日の取引時間中にずれ込むと、`chartData[0]` が
 * summaryDate より後の進行中の足になる。これを summaryDate 以前の足に絞り込んだ後も
 * REQUIRED_CHART_DATA_COUNT 分の本数を確保できるよう、
 * 取得時点で余裕を持たせておく。
 */
const CHART_DATA_FETCH_MARGIN = 5;

/**
 * 取引所を休場日とみなして残りのティッカー処理を打ち切るまでの連続ミス数
 *
 * 休場日には summaryDate のサマリーが1件も作られないため、この判定がないと
 * 休場日の引け後から翌営業日の引けまでの約24時間、毎時のバッチが全ティッカーの
 * 日足（チャート取得件数 REQUIRED_CHART_DATA_COUNT + CHART_DATA_FETCH_MARGIN 件）を
 * 取得し直し続けてしまう。先頭から連続でこの件数だけ「summaryDate の足なし」が続き、
 * かつそれまでに1件も足ありが見つかっていなければ、その取引所は休場日とみなして
 * 残りのティッカーの処理をこの回は打ち切る。
 */
const EXCHANGE_CLOSED_CONSECUTIVE_MISS_THRESHOLD = 3;

/**
 * 休場日の打ち切り判定で「休場ミス」とみなす最新足の鮮度（日数）
 *
 * 上場廃止・長期売買停止などで足が止まっている銘柄を休場ミスに数えると、その銘柄が
 * 先頭に並んだ取引所が毎日打ち切られ続けてしまう。最新足が summaryDate からこの日数
 * 以内にある（＝直前の取引日まで足が出ていた）銘柄だけを休場ミスとして数える。
 */
const EXCHANGE_CLOSED_MISS_MAX_STALENESS_DAYS = 7;

/**
 * fromYmd から toYmd までの暦日差が maxDays 以内かを返す（YYYY-MM-DD 同士の比較）
 */
function isWithinDays(fromYmd: string, toYmd: string, maxDays: number): boolean {
  const diffMs = Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`);
  return diffMs <= maxDays * 24 * 60 * 60 * 1000;
}

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
    // 全件、内部でページを辿り切る（Issue #3788: 51件目以降の打ち切り防止）
    const tickers = await dependencies.tickerRepository.getByExchange(exchange.ExchangeID);
    stats.totalTickers += tickers.length;
    const summaryDate = getLastTradingDate(exchange, now);
    const patternAnalyzer = new PatternAnalyzer();
    // 取引所単位の休場日打ち切り判定用（チャートを取得したティッカーのみ数える）
    let consecutiveNoBarMisses = 0;
    let barFoundForSummaryDate = false;

    for (const ticker of tickers) {
      try {
        const existingSummary = await dependencies.dailySummaryRepository.getByTickerAndDate(
          ticker.TickerID,
          summaryDate
        );
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
            const latestBarDate =
              onOrBeforeSummaryDate.length > 0
                ? formatDateInTimezone(onOrBeforeSummaryDate[0].time, exchange.Timezone)
                : undefined;
            logger.info(
              'summaryDate に一致する取引日の足が見つからないためサマリー生成をスキップします',
              {
                exchangeId: exchange.ExchangeID,
                tickerId: ticker.TickerID,
                summaryDate,
                latestBarDate,
              }
            );
            stats.skippedNoBarForDate++;

            if (
              !barFoundForSummaryDate &&
              latestBarDate !== undefined &&
              isWithinDays(latestBarDate, summaryDate, EXCHANGE_CLOSED_MISS_MAX_STALENESS_DAYS)
            ) {
              consecutiveNoBarMisses++;
              if (consecutiveNoBarMisses >= EXCHANGE_CLOSED_CONSECUTIVE_MISS_THRESHOLD) {
                logger.info(
                  '先頭から連続して summaryDate の足が見つからないため、取引所を休場日とみなし残りのティッカー処理を打ち切ります',
                  {
                    exchangeId: exchange.ExchangeID,
                    summaryDate,
                    consecutiveMisses: consecutiveNoBarMisses,
                  }
                );
                stats.skippedExchangesAsClosed++;
                break;
              }
            }
            continue;
          }

          // summaryDate の足が見つかったので、以降このティッカー処理内では休場日打ち切り判定を行わない
          barFoundForSummaryDate = true;
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

          const summaryInput: CreateDailySummaryInput = {
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
          };
          await dependencies.dailySummaryRepository.upsert(summaryInput);
          stats.summariesSaved++;
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

async function runSummaryBatch(
  event: ScheduledEvent,
  dependencies?: Partial<HandlerDependencies>
): Promise<HandlerResponse> {
  const stats: BatchStatistics = {
    totalExchanges: 0,
    processedExchanges: 0,
    totalTickers: 0,
    processedTickers: 0,
    summariesSaved: 0,
    skippedNoBarForDate: 0,
    skippedExchangesAsClosed: 0,
    errors: 0,
  };

  let resolvedDependencies: HandlerDependencies | undefined;

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
      invokeForecastBatchFn: dependencies.invokeForecastBatchFn ?? invokeForecastBatch,
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
      nowFn: dependencies?.nowFn ?? Date.now,
      invokeForecastBatchFn: dependencies?.invokeForecastBatchFn ?? invokeForecastBatch,
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

  // 毎時の起動を待たずに確度算出へ進められるよう、完了時に forecast バッチを非同期起動する。
  // 保存したサマリーが1件も無ければ、確度算出バッチが読んでも対象日が増えていないため
  // 起動しない。起動失敗はサマリー生成自体の結果に影響させない。invokeForecastBatch 自体が
  // 例外を握りつぶす実装だが、差し替え用のフックが同じ規約を守るとは限らないため、ここでも
  // 二重に保護する。
  if (stats.summariesSaved > 0) {
    try {
      await resolvedDependencies.invokeForecastBatchFn();
    } catch (error) {
      logger.warn('確度算出バッチの起動に失敗しました', { reason: toErrorMessage(error) });
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: '日次サマリー生成バッチが正常に完了しました',
      statistics: stats,
    }),
  };
}

/**
 * Lambda Handler
 *
 * テストから依存を差し替えられるよう、呼び出しごとに骨格へ dependencies を束ねる。
 */
export async function handler(
  event: ScheduledEvent,
  dependencies?: Partial<HandlerDependencies>
): Promise<HandlerResponse> {
  return createScheduledHandler(
    { serviceId: 'stock-tracker', name: 'summary', errorTitle: 'サマリーバッチ: 致命的エラー' },
    (scheduledEvent: ScheduledEvent) => runSummaryBatch(scheduledEvent, dependencies)
  )(event);
}
