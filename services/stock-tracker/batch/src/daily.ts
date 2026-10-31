/**
 * 日次バッチ処理のLambda Handler
 * EventBridge Scheduler から cron(0 0 * * ? *) で実行される（日本時間 9:00）
 * データクリーンアップを実行する
 */

import { logger } from '@nagiyu/common';
import { createScheduledHandler, getDynamoDBDocumentClient, getTableName } from '@nagiyu/aws';
import {
  createAlertRepository,
  type AlertEntity,
  type UnreadableAlertItem,
} from '@nagiyu/stock-tracker-core';

/**
 * 手動削除の対象として記録する、無効なアラートの識別情報。
 * 読めなかったアイテムは alertId / userId が取れないことがあるため、保存キーも持つ。
 */
type InvalidAlertRef = Pick<UnreadableAlertItem, 'alertId' | 'userId' | 'pk' | 'sk'>;

/**
 * バッチ処理の統計情報
 */
interface BatchStatistics {
  totalAlerts: number;
  validSubscriptions: number;
  invalidSubscriptions: number;
  invalidAlerts: InvalidAlertRef[];
}

/**
 * Web Push サブスクリプションの検証
 *
 * @param alert - 検証するアラート
 * @returns サブスクリプションが有効な場合は true、無効な場合は false
 */
function isValidSubscription(alert: AlertEntity): boolean {
  // endpoint が空の場合は無効
  if (!alert.subscription.endpoint || alert.subscription.endpoint.trim() === '') {
    return false;
  }

  // endpoint が URL 形式であることを確認
  try {
    new URL(alert.subscription.endpoint);
  } catch {
    return false;
  }

  // keys.p256dh が空の場合は無効
  if (!alert.subscription.keys.p256dh || alert.subscription.keys.p256dh.trim() === '') {
    return false;
  }

  // keys.auth が空の場合は無効
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

    // 全アラートを、読めないアイテムも含めて取得する。
    // 頻度ごとの取得は読めないアイテムを捨てるため、endpoint や鍵が空のように
    // 保存データが壊れたアラートが、点検の対象から消えてしまう。
    const alertRepo = createAlertRepository(docClient, tableName);
    const { alerts, unreadable } = await alertRepo.getAllForSubscriptionAudit();
    stats.totalAlerts = alerts.length + unreadable.length;

    logger.info('アラートを取得しました', {
      count: stats.totalAlerts,
      unreadableCount: unreadable.length,
    });

    // 各アラートの Web Push サブスクリプションを検証
    for (const alert of alerts) {
      if (isValidSubscription(alert)) {
        stats.validSubscriptions++;
      } else {
        stats.invalidSubscriptions++;
        stats.invalidAlerts.push({ alertId: alert.alertId, userId: alert.userId });

        logger.warn('無効な Web Push サブスクリプションを検出しました', {
          alertId: alert.alertId,
          userId: alert.userId,
          tickerId: alert.tickerId,
          subscriptionEndpoint: alert.subscription.endpoint || '(empty)',
        });
      }
    }

    // 読めなかったアイテムは、購読の検証以前に保存データが壊れているため無効に数える
    for (const item of unreadable) {
      stats.invalidSubscriptions++;
      stats.invalidAlerts.push({
        alertId: item.alertId,
        userId: item.userId,
        pk: item.pk,
        sk: item.sk,
      });

      logger.warn('読めないアラートを検出しました', {
        alertId: item.alertId,
        userId: item.userId,
        pk: item.pk,
        sk: item.sk,
        reason: item.reason,
      });
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

    // 自動では削除せず、手動で削除できるよう識別情報をログに出す
    if (stats.invalidSubscriptions > 0) {
      logger.info('無効なサブスクリプションの手動削除が必要です', {
        invalidCount: stats.invalidSubscriptions,
        invalidAlertIds: stats.invalidAlerts,
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
