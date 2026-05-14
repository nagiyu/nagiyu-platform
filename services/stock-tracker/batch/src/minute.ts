/**
 * 1分間隔バッチ処理のLambda Handler
 * EventBridge Scheduler から rate(1 minute) で実行される
 * MINUTE_LEVEL のアラート条件をチェックして通知を送信する
 */

import { logger, withRetry } from '@nagiyu/common';
import { getDynamoDBDocumentClient, getTableName, reportErrorEvent } from '@nagiyu/aws';
import { sendWebPushNotification, getVapidConfig } from '@nagiyu/common/push';
import { createAlertNotificationPayload } from './lib/web-push-client.js';
import { runConcurrent } from './lib/concurrent-queue.js';
import type { AlertRepository, ExchangeRepository } from '@nagiyu/stock-tracker-core';
import { DynamoDBAlertRepository, DynamoDBExchangeRepository } from '@nagiyu/stock-tracker-core';
import { evaluateAlert } from '@nagiyu/stock-tracker-core';
import { isTradingHours } from '@nagiyu/stock-tracker-core';
import { getCurrentPrice } from '@nagiyu/stock-tracker-core';
import type { Alert, Exchange } from '@nagiyu/stock-tracker-core';

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
  totalAlerts: number;
  processedAlerts: number;
  skippedDisabled: number;
  skippedOffHours: number;
  skippedTimeBudget: number;
  conditionsMet: number;
  notificationsSent: number;
  errors: number;
}

/**
 * 単一のアラートを処理する
 *
 * @param alert - 処理するアラート
 * @param exchangeRepo - Exchange リポジトリ
 * @param stats - バッチ統計情報
 * @returns 処理が成功した場合は true、失敗した場合は false
 */
async function processAlert(
  alert: Alert,
  exchangeRepo: ExchangeRepository,
  stats: BatchStatistics
): Promise<boolean> {
  try {
    // 1. Enabled = true かチェック
    if (!alert.Enabled) {
      logger.debug('無効化されたアラートをスキップします', {
        alertId: alert.AlertID,
        userId: alert.UserID,
      });
      stats.skippedDisabled++;
      return true;
    }

    // 2. Exchange 情報を取得
    const exchange = await exchangeRepo.getById(alert.ExchangeID);
    if (!exchange) {
      logger.warn('取引所情報が見つかりません', {
        alertId: alert.AlertID,
        exchangeId: alert.ExchangeID,
      });
      stats.errors++;
      return false;
    }

    // 3. 取引時間外チェック
    const now = Date.now();
    if (!isTradingHours(exchange, now)) {
      logger.debug('取引時間外のためアラートをスキップします', {
        alertId: alert.AlertID,
        exchangeId: alert.ExchangeID,
        timezone: exchange.Timezone,
      });
      stats.skippedOffHours++;
      return true;
    }

    // 4. TradingView API で現在価格取得
    // timeout を 5s に短縮し maxRetries を 1 にすることで最悪所要時間を ~10.5s に抑える
    const currentPrice = await withRetry<number>(
      () => getCurrentPrice(alert.TickerID, { timeout: 5000 }),
      {
        maxRetries: 1,
        initialDelayMs: 500,
        backoffMultiplier: 2,
      }
    );

    logger.debug('現在価格を取得しました', {
      alertId: alert.AlertID,
      tickerId: alert.TickerID,
      currentPrice,
    });

    // 5. アラート条件評価
    const conditionMet = evaluateAlert(alert, currentPrice);

    if (!conditionMet) {
      logger.debug('アラート条件が未達成です', {
        alertId: alert.AlertID,
        currentPrice,
        conditions: alert.ConditionList,
      });
      return true;
    }

    stats.conditionsMet++;

    // 6. 条件達成時、Web Push 通知送信
    const payload = createAlertNotificationPayload(alert, currentPrice);
    const notificationSent = await sendWebPushNotification(
      alert.subscription,
      payload,
      getVapidConfig()
    );

    if (notificationSent) {
      stats.notificationsSent++;
      logger.info('アラート通知を送信しました', {
        alertId: alert.AlertID,
        userId: alert.UserID,
        tickerId: alert.TickerID,
        currentPrice,
        conditions: alert.ConditionList,
      });
    } else {
      stats.errors++;
    }

    return notificationSent;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('アラート処理中にエラーが発生しました', {
      alertId: alert.AlertID,
      userId: alert.UserID,
      error: errorMessage,
    });
    await reportErrorEvent({
      serviceId: 'stock-tracker',
      severity: 'warning',
      title: '分次バッチ: アラート処理エラー',
      message: errorMessage,
      context: {
        alertId: alert.AlertID,
        userId: alert.UserID,
        errorStack: error instanceof Error ? error.stack : undefined,
      },
    });
    stats.errors++;
    return false;
  }
}

/**
 * Lambda Handler
 * EventBridge Scheduler から定期実行される
 */
export async function handler(event: ScheduledEvent): Promise<HandlerResponse> {
  const startTime = Date.now();

  logger.info('1分間隔バッチ処理を開始します', {
    eventId: event.id,
    eventTime: event.time,
  });

  // バッチ統計情報の初期化
  const stats: BatchStatistics = {
    totalAlerts: 0,
    processedAlerts: 0,
    skippedDisabled: 0,
    skippedOffHours: 0,
    skippedTimeBudget: 0,
    conditionsMet: 0,
    notificationsSent: 0,
    errors: 0,
  };

  // 並列度・時間予算は環境変数で調整可能
  // TIME_BUDGET_MS を 38s に設定し、in-flight タスクの完了（最大 ~10.5s）を含めて 50s 以内に収める
  const concurrency = parseInt(process.env.MINUTE_BATCH_CONCURRENCY ?? '10', 10);
  const timeBudgetMs = parseInt(process.env.MINUTE_BATCH_TIME_BUDGET_MS ?? '38000', 10);
  const isBudgetExceeded = (): boolean => Date.now() - startTime > timeBudgetMs;

  try {
    // DynamoDB クライアントとリポジトリの初期化
    const docClient = getDynamoDBDocumentClient();
    const tableName = getTableName();
    const alertRepo = new DynamoDBAlertRepository(docClient, tableName);
    const exchangeRepo = new DynamoDBExchangeRepository(docClient, tableName);

    // 1. GSI2 で MINUTE_LEVEL アラート一覧を取得
    const alertsResult = await alertRepo.getByFrequency('MINUTE_LEVEL');
    const alerts = alertsResult.items;
    stats.totalAlerts = alerts.length;

    logger.info('MINUTE_LEVEL アラートを取得しました', {
      count: alerts.length,
    });

    // 2. 順序をシャッフルして特定アラートが常に後回しになることを防ぐ
    const shuffledAlerts = [...alerts].sort(() => Math.random() - 0.5);

    // 3. 並列度上限・時間予算ガードで各アラートを処理
    const tasks = shuffledAlerts.map((alert) => () => processAlert(alert, exchangeRepo, stats));

    const { results, skippedCount } = await runConcurrent(tasks, concurrency, isBudgetExceeded);

    stats.processedAlerts = results.length;
    stats.skippedTimeBudget = skippedCount;

    if (skippedCount > 0) {
      logger.warn('時間予算超過のためアラートをスキップしました', {
        skippedCount,
        elapsedMs: Date.now() - startTime,
      });
    }

    // 最終統計をログ出力
    logger.info('1分間隔バッチ処理が正常に完了しました', {
      eventId: event.id,
      statistics: stats,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: '1分間隔バッチ処理が正常に完了しました',
        statistics: stats,
      }),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('1分間隔バッチ処理でエラーが発生しました', {
      eventId: event.id,
      error: errorMessage,
      statistics: stats,
    });
    await reportErrorEvent({
      serviceId: 'stock-tracker',
      severity: 'error',
      title: '分次バッチ: 致命的エラー',
      message: errorMessage,
      context: { eventId: event.id, statistics: stats },
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: '1分間隔バッチ処理でエラーが発生しました',
        error: errorMessage,
        statistics: stats,
      }),
    };
  }
}
