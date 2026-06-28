/**
 * 1分間隔バッチ処理のLambda Handler
 * EventBridge Scheduler から rate(1 minute) で実行される
 * MINUTE_LEVEL のアラート条件をチェックして通知を送信する
 */

import { logger, toErrorMessage } from '@nagiyu/common';
import { getDynamoDBDocumentClient, getTableName, reportErrorEvent } from '@nagiyu/aws';
import { sendWebPushNotification, getVapidConfig } from '@nagiyu/common/push';
import { createAlertNotificationPayload } from './lib/web-push-client.js';
import { runConcurrent } from './lib/concurrent-queue.js';
import type { ExchangeRepository } from '@nagiyu/stock-tracker-core';
import { DynamoDBAlertRepository, DynamoDBExchangeRepository } from '@nagiyu/stock-tracker-core';
import { evaluateAlert } from '@nagiyu/stock-tracker-core';
import { isTradingHours } from '@nagiyu/stock-tracker-core';
import {
  TradingViewSession,
  getCurrentPrice,
  FinnhubQuoteProvider,
  DEFAULT_PRICE_SOURCE,
} from '@nagiyu/stock-tracker-core';
import type { Alert } from '@nagiyu/stock-tracker-core';

/**
 * 指定ミリ秒待機する
 *
 * @param ms - 待機時間（ミリ秒）
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  /** 共有セッション失敗後に新規 WS で再試行した回数 */
  freshSessionRetries: number;
}

/**
 * 単一のアラートを処理する
 *
 * @param alert - 処理するアラート
 * @param exchangeRepo - Exchange リポジトリ
 * @param session - invocation 共有の TradingView セッション
 * @param finnhubProvider - Finnhub QuoteProvider（PriceSource = 'finnhub' の場合に使用）
 * @param stats - バッチ統計情報
 * @param firstAttemptTimeoutMs - 共有セッションの 1 回目タイムアウト（ms）
 * @param retryTimeoutMs - 新規 WS リトライのタイムアウト（ms）
 * @param retryDelayMs - 1 回目失敗後のリトライ前遅延（ms）
 * @returns 処理が成功した場合は true、失敗した場合は false
 */
async function processAlert(
  alert: Alert,
  exchangeRepo: ExchangeRepository,
  session: TradingViewSession,
  finnhubProvider: FinnhubQuoteProvider,
  stats: BatchStatistics,
  firstAttemptTimeoutMs: number,
  retryTimeoutMs: number,
  retryDelayMs: number
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

    // 4. Exchange.PriceSource に応じて現在価格取得経路を選択
    // - finnhub: Finnhub API への単発リクエスト（fresh-WS リトライなし）
    // - tradingview（デフォルト）: 共有セッション再利用 → 失敗時に fresh-WS 再試行
    const priceSource = exchange.PriceSource ?? DEFAULT_PRICE_SOURCE;
    let currentPrice: number;

    if (priceSource === 'finnhub') {
      // Finnhub 経路: 単発リクエスト。失敗は外側 catch へ伝播し stats.errors++ となる
      currentPrice = await finnhubProvider.getCurrentPrice(alert.TickerID, {
        timeout: firstAttemptTimeoutMs,
      });
    } else {
      // TradingView 経路（共有セッション温存最適化）:
      // 1 回目: 共有セッションを再利用（healthy 時の handshake 削減）
      // 失敗時: 独立した新規 WS で 1 回だけ再試行（死んだ共有接続を完全にバイパス）
      try {
        currentPrice = await session.getCurrentPrice(alert.TickerID, {
          timeout: firstAttemptTimeoutMs,
        });
      } catch (firstError) {
        stats.freshSessionRetries++;
        logger.warn('共有セッションでの価格取得に失敗。新規 WS で再試行します', {
          alertId: alert.AlertID,
          tickerId: alert.TickerID,
          sessionId: session.getSessionId(),
          firstError: toErrorMessage(firstError),
        });
        await sleep(retryDelayMs);
        // 失敗時は外側 catch へ伝播させてエラー扱いとする
        currentPrice = await getCurrentPrice(alert.TickerID, { timeout: retryTimeoutMs });
      }
    }

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
    const errorMessage = toErrorMessage(error);
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
    freshSessionRetries: 0,
  };

  // 並列度・時間予算・タイムアウトは環境変数で調整可能
  // 並列度を 3 に下げることで WS 接続バーストを緩和する（jitter と併用）
  // TIME_BUDGET_MS を 30s に設定し、in-flight タスクの完了（最大 ~12.5s）を含めて 50s 以内に収める
  // worst case/ticker = FIRST_ATTEMPT_TIMEOUT(4s) + RETRY_DELAY(0.5s) + RETRY_TIMEOUT(8s) = 12.5s
  const concurrency = parseInt(process.env.MINUTE_BATCH_CONCURRENCY ?? '3', 10);
  const timeBudgetMs = parseInt(process.env.MINUTE_BATCH_TIME_BUDGET_MS ?? '30000', 10);
  const firstAttemptTimeoutMs = parseInt(
    process.env.MINUTE_BATCH_FIRST_ATTEMPT_TIMEOUT_MS ?? '4000',
    10
  );
  const retryTimeoutMs = parseInt(process.env.MINUTE_BATCH_RETRY_TIMEOUT_MS ?? '8000', 10);
  const retryDelayMs = parseInt(process.env.MINUTE_BATCH_RETRY_DELAY_MS ?? '500', 10);
  const isBudgetExceeded = (): boolean => Date.now() - startTime > timeBudgetMs;

  // container kill 閾値: invocation 内エラー数がこの値以上になると process.exit(1) で container を廃棄する
  // 観測（PR #3290 デプロイ後）: broken container でも 1 invocation あたり errors は最大 1 のため、閾値 1 で kill する。
  // 誤検知コストは Lambda cold start のみで運用影響ゼロ。broken container 居座りによる通知欠落の方が深刻。
  const containerKillThreshold = parseInt(
    process.env.MINUTE_BATCH_CONTAINER_KILL_THRESHOLD ?? '1',
    10
  );
  let shouldKillContainer = false;

  // invocation スコープで 1 つの TradingView WebSocket 接続を共有する
  const session = new TradingViewSession();
  // Finnhub 経路（PriceSource = 'finnhub'）用のプロバイダーを 1 回生成
  const finnhubProvider = new FinnhubQuoteProvider();

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

    // 3. 並列度上限・時間予算ガード・jitter でアラートを処理
    const tasks = shuffledAlerts.map(
      (alert) => () =>
        processAlert(
          alert,
          exchangeRepo,
          session,
          finnhubProvider,
          stats,
          firstAttemptTimeoutMs,
          retryTimeoutMs,
          retryDelayMs
        )
    );

    const { results, skippedCount } = await runConcurrent(tasks, concurrency, isBudgetExceeded, {
      jitterMs: 150,
    });

    stats.processedAlerts = results.length;
    stats.skippedTimeBudget = skippedCount;

    if (skippedCount > 0) {
      logger.warn('時間予算超過のためアラートをスキップしました', {
        skippedCount,
        elapsedMs: Date.now() - startTime,
      });
    }

    // broken container 検出: invocation 内エラー数が閾値以上なら container を廃棄する
    // finally ブロックで session.close() 後に process.exit(1) を呼ぶ
    if (stats.errors >= containerKillThreshold) {
      shouldKillContainer = true;
      logger.warn('連続タイムアウト発生のため container を破棄します', {
        errors: stats.errors,
        threshold: containerKillThreshold,
        sessionId: session.getSessionId(),
      });
    }

    // 最終統計をログ出力
    logger.info('1分間隔バッチ処理が正常に完了しました', {
      eventId: event.id,
      statistics: stats,
      sessionId: session.getSessionId(),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: '1分間隔バッチ処理が正常に完了しました',
        statistics: stats,
      }),
    };
  } catch (error) {
    const errorMessage = toErrorMessage(error);
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
  } finally {
    await session.close();
    if (shouldKillContainer) {
      process.exit(1);
    }
  }
}
