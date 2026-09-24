/**
 * 予測精度の採点バッチ Lambda Handler
 *
 * EventBridge から rate(1 hour) で起動され、未採点かつ翌営業日引け済みの予測を採点する。
 *
 * フロー:
 *   1. `findPendingEvaluations` で未採点予測を抽出
 *   2. 各候補について TradingView API で翌営業日終値を取得
 *   3. `judgePrediction` で Hit/Miss を判定
 *   4. `DailySummaryRepository.markAsEvaluated` で書き込み（冪等）
 *
 * 個別の失敗（TradingView エラー、既採点 ConditionalCheck 違反 等）は continue し、
 * 全体は停止しない。最後に統計をログ出力する。
 */

import { logger, toErrorMessage } from '@nagiyu/common';
import {
  EntityAlreadyExistsError,
  getDynamoDBDocumentClient,
  getTableName,
  reportErrorEvent,
} from '@nagiyu/aws';
import {
  DynamoDBDailySummaryRepository,
  DynamoDBExchangeRepository,
  formatDateInTimezone,
  getChartData,
  judgePrediction,
} from '@nagiyu/stock-tracker-core';
import type {
  DailySummaryRepository,
  ExchangeEntity,
  ExchangeRepository,
} from '@nagiyu/stock-tracker-core';
import { findPendingEvaluations, type PendingEvaluation } from './lib/find-pending-evaluations.js';

/**
 * Phase 1 で採点に使う閾値（%）
 */
const EVALUATION_THRESHOLD_PERCENT = 0.5;

/**
 * 翌営業日終値を引くために取得する日足の本数
 *
 * Phase 1 ではバックフィルを最大 30 日分想定する findPendingEvaluations の窓と合わせ、
 * 余裕を持って 60 日分取得する。
 */
const CHART_DATA_COUNT = 60;

/**
 * Lambda Handler イベント型
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
 * 採点バッチの統計情報
 */
export interface EvaluationStatistics {
  /** 抽出された採点候補数 */
  totalCandidates: number;
  /** 採点書き込みに成功した件数 */
  evaluated: number;
  /** 既採点（並列実行による）でスキップした件数 */
  alreadyEvaluatedSkipped: number;
  /** TradingView 終値が取得できずスキップした件数 */
  missingClose: number;
  /** チャートに予測日（基準日）の足が見つからずスキップした件数（休場日コピー足の可能性） */
  missingBaseBar: number;
  /** 個別失敗で continue した件数 */
  failed: number;
}

/**
 * 依存注入用
 */
export interface HandlerDependencies {
  exchangeRepository: ExchangeRepository;
  dailySummaryRepository: DailySummaryRepository;
  getChartDataFn: typeof getChartData;
  nowFn: () => number;
  /** テスト時に findPendingEvaluations を差し替えるためのフック */
  findPendingEvaluationsFn?: typeof findPendingEvaluations;
}

/**
 * 日足チャートから指定日 (取引所タイムゾーン基準の YYYY-MM-DD) の終値を抽出する
 */
function findCloseForDate(
  chartData: Awaited<ReturnType<typeof getChartData>>,
  exchange: ExchangeEntity,
  dateYmd: string
): number | null {
  for (const point of chartData) {
    const ymd = formatDateInTimezone(point.time, exchange.Timezone);
    if (ymd === dateYmd) {
      return point.close;
    }
  }
  return null;
}

/**
 * 日足チャートから、指定日 (取引所タイムゾーン基準) より後にある最初の足を返す
 *
 * chartData は新しい順（先頭が最新）に並んでいる前提のため、末尾（最も古い側）から
 * 走査して dateYmd より後の足のうち最も古いもの（＝直後の取引日）を返す。
 * 該当する足がなければ null（まだ翌営業日が引けていない）。
 */
function findNextBarAfterDate(
  chartData: Awaited<ReturnType<typeof getChartData>>,
  exchange: ExchangeEntity,
  dateYmd: string
): Awaited<ReturnType<typeof getChartData>>[number] | null {
  for (let i = chartData.length - 1; i >= 0; i--) {
    const point = chartData[i];
    if (formatDateInTimezone(point.time, exchange.Timezone) > dateYmd) {
      return point;
    }
  }
  return null;
}

async function evaluateOne(
  candidate: PendingEvaluation,
  dependencies: HandlerDependencies,
  stats: EvaluationStatistics,
  now: number
): Promise<void> {
  const { summary, exchange, lastTradingDate } = candidate;
  const signal = summary.AiAnalysisResult?.investmentJudgment.signal;
  if (!signal) {
    // findPendingEvaluations のフィルタを通っているはずだが、防御的に skip
    stats.failed++;
    logger.warn('AiAnalysisResult が欠損している採点候補をスキップします', {
      tickerId: summary.TickerID,
      date: summary.Date,
    });
    return;
  }

  let chartData: Awaited<ReturnType<typeof getChartData>>;
  try {
    chartData = await dependencies.getChartDataFn(summary.TickerID, 'D', {
      count: CHART_DATA_COUNT,
      session: 'extended',
    });
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    logger.warn('翌営業日終値の取得に失敗したため当該予測の採点をスキップします', {
      tickerId: summary.TickerID,
      date: summary.Date,
      reason: errorMessage,
    });
    await reportErrorEvent({
      serviceId: 'stock-tracker',
      severity: 'warning',
      title: '採点バッチ: 翌営業日終値取得失敗',
      message: errorMessage,
      context: {
        tickerId: summary.TickerID,
        date: summary.Date,
        errorStack: error instanceof Error ? error.stack : undefined,
      },
    });
    stats.failed++;
    return;
  }

  // 祝日マスターを持たないため、評価日は「予測日より後の最初の足」からチャート実データで確定する
  const nextBar = findNextBarAfterDate(chartData, exchange, summary.Date);
  if (nextBar === null) {
    logger.info('予測日より後の足がまだチャートに存在しないため次回 cron で再試行します', {
      tickerId: summary.TickerID,
      date: summary.Date,
    });
    stats.missingClose++;
    return;
  }

  const evaluationDate = formatDateInTimezone(nextBar.time, exchange.Timezone);
  if (evaluationDate > lastTradingDate) {
    // まだ引けていない（進行中の）足のため次回 cron で再試行する
    logger.info('評価日の足がまだ引けていないため次回 cron で再試行します', {
      tickerId: summary.TickerID,
      date: summary.Date,
      evaluationDate,
      lastTradingDate,
    });
    stats.missingClose++;
    return;
  }
  const evaluationClose = nextBar.close;

  // 基準終値は同じチャート上の予測日の足を使う（株式分割等で調整後の値どうしを比較するため）。
  // CHART_DATA_COUNT は 30 日の走査窓を十分カバーできるため、ここで見つからないのは
  // ほぼ確実に「予測日が休場日だった（既存の休場日コピー足）」ケースであり、
  // summary.Close へフォールバックすると誤ったレコードまで採点してしまう。
  // そのため見つからない場合は summary.Close にフォールバックせず、採点自体をスキップする
  // （リトライ上限 MAX_EVALUATION_BUSINESS_DAYS で卒業する）。
  const baseClose = findCloseForDate(chartData, exchange, summary.Date);
  if (baseClose === null) {
    logger.info('予測日の足がチャートに存在しない（休場日の可能性）ため採点しません', {
      tickerId: summary.TickerID,
      date: summary.Date,
    });
    stats.missingBaseBar++;
    return;
  }

  let judgeResult: ReturnType<typeof judgePrediction>;
  try {
    judgeResult = judgePrediction({
      signal,
      baseClose,
      evaluationClose,
      thresholdPercent: EVALUATION_THRESHOLD_PERCENT,
    });
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    logger.warn('判定ロジックでエラーが発生したため当該予測の採点をスキップします', {
      tickerId: summary.TickerID,
      date: summary.Date,
      evaluationDate,
      reason: errorMessage,
    });
    stats.failed++;
    return;
  }

  try {
    await dependencies.dailySummaryRepository.markAsEvaluated(
      { tickerId: summary.TickerID, date: summary.Date },
      {
        EvaluationDate: evaluationDate,
        EvaluationClose: evaluationClose,
        ActualReturn: judgeResult.actualReturn,
        Hit: judgeResult.hit,
        EvaluationThresholdPercent: EVALUATION_THRESHOLD_PERCENT,
        EvaluatedAt: now,
      }
    );
    stats.evaluated++;
  } catch (error) {
    if (error instanceof EntityAlreadyExistsError) {
      // 並列起動による既採点。冪等性確保のため info ログのみで継続
      logger.info('既に採点済みのためスキップします', {
        tickerId: summary.TickerID,
        date: summary.Date,
      });
      stats.alreadyEvaluatedSkipped++;
      return;
    }
    const errorMessage = toErrorMessage(error);
    logger.warn('採点結果の書き込みに失敗したため当該予測の採点をスキップします', {
      tickerId: summary.TickerID,
      date: summary.Date,
      evaluationDate,
      reason: errorMessage,
    });
    await reportErrorEvent({
      serviceId: 'stock-tracker',
      severity: 'warning',
      title: '採点バッチ: 採点結果書き込み失敗',
      message: errorMessage,
      context: {
        tickerId: summary.TickerID,
        date: summary.Date,
        evaluationDate,
        errorStack: error instanceof Error ? error.stack : undefined,
      },
    });
    stats.failed++;
  }
}

/**
 * Lambda Handler
 */
export async function handler(
  event: ScheduledEvent,
  dependencies?: Partial<HandlerDependencies>
): Promise<HandlerResponse> {
  logger.info('予測精度の採点バッチを開始します', {
    eventId: event.id,
    eventTime: event.time,
  });

  const stats: EvaluationStatistics = {
    totalCandidates: 0,
    evaluated: 0,
    alreadyEvaluatedSkipped: 0,
    missingClose: 0,
    missingBaseBar: 0,
    failed: 0,
  };

  try {
    let resolved: HandlerDependencies;
    if (dependencies?.exchangeRepository && dependencies?.dailySummaryRepository) {
      resolved = {
        exchangeRepository: dependencies.exchangeRepository,
        dailySummaryRepository: dependencies.dailySummaryRepository,
        getChartDataFn: dependencies.getChartDataFn ?? getChartData,
        nowFn: dependencies.nowFn ?? Date.now,
        findPendingEvaluationsFn: dependencies.findPendingEvaluationsFn ?? findPendingEvaluations,
      };
    } else {
      const docClient = getDynamoDBDocumentClient();
      const tableName = getTableName();
      resolved = {
        exchangeRepository: new DynamoDBExchangeRepository(docClient, tableName),
        dailySummaryRepository: new DynamoDBDailySummaryRepository(docClient, tableName),
        getChartDataFn: dependencies?.getChartDataFn ?? getChartData,
        nowFn: dependencies?.nowFn ?? Date.now,
        findPendingEvaluationsFn: dependencies?.findPendingEvaluationsFn ?? findPendingEvaluations,
      };
    }

    const now = resolved.nowFn();
    const candidates = await resolved.findPendingEvaluationsFn!(
      resolved.exchangeRepository,
      resolved.dailySummaryRepository,
      now
    );
    stats.totalCandidates = candidates.length;

    for (const candidate of candidates) {
      await evaluateOne(candidate, resolved, stats, now);
    }

    logger.info('予測精度の採点バッチが正常に完了しました', {
      eventId: event.id,
      statistics: stats,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: '予測精度の採点バッチが正常に完了しました',
        statistics: stats,
      }),
    };
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    logger.error('予測精度の採点バッチでエラーが発生しました', {
      eventId: event.id,
      error: errorMessage,
      statistics: stats,
    });
    await reportErrorEvent({
      serviceId: 'stock-tracker',
      severity: 'error',
      title: '採点バッチ: 致命的エラー',
      message: errorMessage,
      context: { eventId: event.id, statistics: stats },
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: '予測精度の採点バッチでエラーが発生しました',
        error: errorMessage,
        statistics: stats,
      }),
    };
  }
}
