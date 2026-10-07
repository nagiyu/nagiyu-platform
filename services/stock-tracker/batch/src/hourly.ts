/**
 * 1時間間隔バッチ処理のLambda Handler
 * EventBridge Scheduler から rate(1 hour) で実行される
 * HOURLY_LEVEL のアラート条件をチェックして通知を送信する
 */

import { logger, toErrorMessage, withRetry } from '@nagiyu/common';
import {
  createScheduledHandler,
  getDynamoDBDocumentClient,
  getTableName,
  reportErrorEvent,
} from '@nagiyu/aws';
import { sendWebPushNotification, getVapidConfig } from '@nagiyu/common/push';
import { createAlertNotificationPayload } from './lib/web-push-client.js';
import type { ExchangeRepository } from '@nagiyu/stock-tracker-core';
import { DynamoDBAlertRepository, DynamoDBExchangeRepository } from '@nagiyu/stock-tracker-core';
import { evaluateAlert } from '@nagiyu/stock-tracker-core';
import { isTradingHours } from '@nagiyu/stock-tracker-core';
import {
  TradingViewQuoteProvider,
  FinnhubQuoteProvider,
  resolveQuoteProvider,
  DEFAULT_PRICE_SOURCE,
} from '@nagiyu/stock-tracker-core';
import type { Alert } from '@nagiyu/stock-tracker-core';

/**
 * バッチ処理の統計情報
 */
interface BatchStatistics {
  totalAlerts: number;
  processedAlerts: number;
  skippedDisabled: number;
  skippedOffHours: number;
  conditionsMet: number;
  notificationsSent: number;
  errors: number;
  /** 送信先の購読が無効（404/410）で通知をスキップした件数。errors には含めない */
  invalidSubscriptions: number;
}

/**
 * QuoteProvider マップ
 *
 * invocation スコープで共有するプロバイダーインスタンスを保持する
 */
interface ProviderMap {
  tradingView: TradingViewQuoteProvider;
  finnhub: FinnhubQuoteProvider;
}

/**
 * 単一のアラートを処理する
 *
 * @param alert - 処理するアラート
 * @param exchangeRepo - Exchange リポジトリ
 * @param providers - QuoteProvider マップ（tradingView / finnhub）
 * @param stats - バッチ統計情報
 * @returns エラーなく処理できた場合は true（購読が無効で通知をスキップした場合も含む）、失敗した場合は false
 */
async function processAlert(
  alert: Alert,
  exchangeRepo: ExchangeRepository,
  providers: ProviderMap,
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

    // 4. Exchange.PriceSource で解決した provider で現在価格取得（リトライ付き）
    const priceSource = exchange.PriceSource ?? DEFAULT_PRICE_SOURCE;
    const provider = resolveQuoteProvider(priceSource, providers);
    const currentPrice = await withRetry<number>(() => provider.getCurrentPrice(alert.TickerID), {
      maxRetries: 2,
      initialDelayMs: 500,
      backoffMultiplier: 2,
    });

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
      // 購読はアラートのフィールドなので、無効だからと消すとユーザーの条件設定ごと失われる。
      // 購読はユーザーが次に画面を開いたときに更新されるため、それまでの空振りは許容する。
      stats.invalidSubscriptions++;
      logger.warn('送信先の Web Push 購読が無効なため通知をスキップしました', {
        alertId: alert.AlertID,
        userId: alert.UserID,
        tickerId: alert.TickerID,
      });
    }

    // 購読が無効でもエラーではないため成功扱いにする
    return true;
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
      title: '時間次バッチ: アラート処理エラー',
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
export const handler = createScheduledHandler(
  { serviceId: 'stock-tracker', name: 'hourly', errorTitle: '時間次バッチ: 致命的エラー' },
  async (event) => {
    // バッチ統計情報の初期化
    const stats: BatchStatistics = {
      totalAlerts: 0,
      processedAlerts: 0,
      skippedDisabled: 0,
      skippedOffHours: 0,
      conditionsMet: 0,
      notificationsSent: 0,
      errors: 0,
      invalidSubscriptions: 0,
    };

    // DynamoDB クライアントとリポジトリの初期化
    const docClient = getDynamoDBDocumentClient();
    const tableName = getTableName();
    const alertRepo = new DynamoDBAlertRepository(docClient, tableName);
    const exchangeRepo = new DynamoDBExchangeRepository(docClient, tableName);

    // invocation スコープで QuoteProvider を各 1 回生成
    const providers: ProviderMap = {
      tradingView: new TradingViewQuoteProvider(),
      finnhub: new FinnhubQuoteProvider(),
    };

    // 1. GSI2 で HOURLY_LEVEL アラート一覧を取得（全件、内部でページを辿り切る）
    const alerts = await alertRepo.getByFrequency('HOURLY_LEVEL');
    stats.totalAlerts = alerts.length;

    logger.info('HOURLY_LEVEL アラートを取得しました', {
      count: alerts.length,
    });

    // 2. 各アラートに対して処理を実行
    for (const alert of alerts) {
      await processAlert(alert, exchangeRepo, providers, stats);
      stats.processedAlerts++;
    }

    // 最終統計をログ出力
    logger.info('1時間間隔バッチ処理が正常に完了しました', {
      eventId: event.id,
      statistics: stats,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: '1時間間隔バッチ処理が正常に完了しました',
        statistics: stats,
      }),
    };
  }
);
