/**
 * 日次バッチ処理のLambda Handler
 * EventBridge Scheduler から cron(0 0 * * ? *) で実行される（日本時間 9:00）
 * データクリーンアップを実行する
 */

import { logger } from './lib/logger.js';
import { getDynamoDBDocumentClient, getTableName } from './lib/aws-clients.js';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { Alert } from '@nagiyu/stock-tracker-core';

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
  validSubscriptions: number;
  invalidSubscriptions: number;
  invalidAlerts: Alert[];
}

/**
 * Web Push サブスクリプションの検証
 *
 * @param alert - 検証するアラート
 * @returns サブスクリプションが有効な場合は true、無効な場合は false
 */
function isValidSubscription(alert: Alert): boolean {
  // SubscriptionEndpoint が空または不正な形式の場合は無効
  if (!alert.SubscriptionEndpoint || alert.SubscriptionEndpoint.trim() === '') {
    return false;
  }

  // SubscriptionEndpoint が URL 形式であることを確認
  try {
    new URL(alert.SubscriptionEndpoint);
  } catch {
    return false;
  }

  // SubscriptionKeysP256dh が空の場合は無効
  if (!alert.SubscriptionKeysP256dh || alert.SubscriptionKeysP256dh.trim() === '') {
    return false;
  }

  // SubscriptionKeysAuth が空の場合は無効
  if (!alert.SubscriptionKeysAuth || alert.SubscriptionKeysAuth.trim() === '') {
    return false;
  }

  return true;
}

/**
 * Lambda Handler
 * EventBridge Scheduler から定期実行される
 */
export async function handler(event: ScheduledEvent): Promise<HandlerResponse> {
  logger.info('日次バッチ処理を開始します', {
    eventId: event.id,
    eventTime: event.time,
  });

  // バッチ統計情報の初期化
  const stats: BatchStatistics = {
    totalAlerts: 0,
    validSubscriptions: 0,
    invalidSubscriptions: 0,
    invalidAlerts: [],
  };

  try {
    // DynamoDB クライアントの初期化
    const docClient = getDynamoDBDocumentClient();
    const tableName = getTableName();

    // 全アラートを取得（ScanCommand を使用）
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: '#type = :type',
        ExpressionAttributeNames: {
          '#type': 'Type',
        },
        ExpressionAttributeValues: {
          ':type': 'Alert',
        },
      })
    );

    const alerts = (result.Items || []) as Alert[];
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
          alertId: alert.AlertID,
          userId: alert.UserID,
          tickerId: alert.TickerID,
          subscriptionEndpoint: alert.SubscriptionEndpoint || '(empty)',
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
          alertId: a.AlertID,
          userId: a.UserID,
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('日次バッチ処理でエラーが発生しました', {
      eventId: event.id,
      error: errorMessage,
      statistics: {
        totalAlerts: stats.totalAlerts,
        validSubscriptions: stats.validSubscriptions,
        invalidSubscriptions: stats.invalidSubscriptions,
      },
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: '日次バッチ処理でエラーが発生しました',
        error: errorMessage,
      }),
    };
  }
}
