/**
 * 日次バッチ処理のLambda Handler
 * EventBridge Scheduler から cron(0 0 * * ? *) で実行される（日本時間 9:00）
 * データクリーンアップを実行する
 */

import { logger } from '@nagiyu/common';
import { createScheduledHandler, getDynamoDBDocumentClient, getTableName } from '@nagiyu/aws';
import { DynamoDBAlertRepository, type AlertEntity } from '@nagiyu/stock-tracker-core';

/**
 * バッチ処理の統計情報
 */
interface BatchStatistics {
  totalAlerts: number;
  validSubscriptions: number;
  invalidSubscriptions: number;
  invalidAlerts: AlertEntity[];
}

/**
 * Web Push サブスクリプションの検証
 *
 * @param alert - 検証するアラート
 * @returns サブスクリプションが有効な場合は true、無効な場合は false
 */
function isValidSubscription(alert: AlertEntity): boolean {
  // SubscriptionEndpoint が空または不正な形式の場合は無効
  if (!alert.subscription.endpoint || alert.subscription.endpoint.trim() === '') {
    return false;
  }

  // SubscriptionEndpoint が URL 形式であることを確認
  try {
    new URL(alert.subscription.endpoint);
  } catch {
    return false;
  }

  // SubscriptionKeysP256dh が空の場合は無効
  if (!alert.subscription.keys.p256dh || alert.subscription.keys.p256dh.trim() === '') {
    return false;
  }

  // SubscriptionKeysAuth が空の場合は無効
  if (!alert.subscription.keys.auth || alert.subscription.keys.auth.trim() === '') {
    return false;
  }

  return true;
}

/**
 * Lambda Handler
 * EventBridge Scheduler から定期実行される
 */
export const handler = createScheduledHandler(
  { serviceId: 'stock-tracker', name: 'daily', errorTitle: '日次バッチ: 致命的エラー' },
  async (event) => {
    // バッチ統計情報の初期化
    const stats: BatchStatistics = {
      totalAlerts: 0,
      validSubscriptions: 0,
      invalidSubscriptions: 0,
      invalidAlerts: [],
    };

    // DynamoDB クライアントの初期化
    const docClient = getDynamoDBDocumentClient();
    const tableName = getTableName();

    // 全アラートを取得する。頻度は 2 値のみで、頻度ごとの取得は全ページを辿るため、
    // 両方を合わせれば全アラートになる。
    const alertRepo = new DynamoDBAlertRepository(docClient, tableName);
    const [minuteAlerts, hourlyAlerts] = await Promise.all([
      alertRepo.getByFrequency('MINUTE_LEVEL'),
      alertRepo.getByFrequency('HOURLY_LEVEL'),
    ]);
    const alerts = [...minuteAlerts, ...hourlyAlerts];
    stats.totalAlerts = alerts.length;

    logger.info('アラートを取得しました', {
      count: alerts.length,
    });

    // 各アラートの Web Push サブスクリプションを検証
    for (const alert of alerts) {
      if (isValidSubscription(alert)) {
        stats.validSubscriptions++;
      } else {
        stats.invalidSubscriptions++;
        stats.invalidAlerts.push(alert);

        logger.warn('無効な Web Push サブスクリプションを検出しました', {
          alertId: alert.alertId,
          userId: alert.userId,
          tickerId: alert.tickerId,
          subscriptionEndpoint: alert.subscription.endpoint || '(empty)',
        });
      }
    }

    // 最終統計をログ出力
    logger.info('日次バッチ処理が正常に完了しました', {
      eventId: event.id,
      statistics: {
        totalAlerts: stats.totalAlerts,
        validSubscriptions: stats.validSubscriptions,
        invalidSubscriptions: stats.invalidSubscriptions,
      },
    });

    // Phase 1 では無効なサブスクリプションの情報を返すのみ（手動削除用）
    if (stats.invalidSubscriptions > 0) {
      logger.info('無効なサブスクリプションの手動削除が必要です', {
        invalidCount: stats.invalidSubscriptions,
        invalidAlertIds: stats.invalidAlerts.map((a) => ({
          alertId: a.alertId,
          userId: a.userId,
        })),
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: '日次バッチ処理が正常に完了しました',
        statistics: {
          totalAlerts: stats.totalAlerts,
          validSubscriptions: stats.validSubscriptions,
          invalidSubscriptions: stats.invalidSubscriptions,
        },
      }),
    };
  }
);
