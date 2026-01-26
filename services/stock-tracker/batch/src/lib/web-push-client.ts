/**
 * Web Push 通知送信クライアント
 * Web Push API を使用してブラウザ通知を送信する
 */

import webpush from 'web-push';
import { logger } from './logger.js';
import type { Alert } from '@nagiyu/stock-tracker-core';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  VAPID_NOT_CONFIGURED: 'VAPID キーが設定されていません',
  NOTIFICATION_FAILED: '通知の送信に失敗しました',
} as const;

/**
 * Web Push 通知のペイロード
 */
export type NotificationPayload = {
  title: string;
  body: string;
  icon?: string;
  data?: Record<string, unknown>;
};

/**
 * VAPID キーを環境変数から取得して設定する
 *
 * @throws {Error} VAPID キーが未設定の場合
 */
function configureVapidKeys(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    throw new Error(ERROR_MESSAGES.VAPID_NOT_CONFIGURED);
  }

  webpush.setVapidDetails('mailto:support@nagiyu.com', publicKey, privateKey);
}

/**
 * Web Push 通知を送信する
 *
 * @param alert - アラート情報（サブスクリプション情報を含む）
 * @param payload - 通知ペイロード
 * @returns 送信成功時は true、失敗時は false
 *
 * @example
 * ```typescript
 * const alert: Alert = { ... };
 * const payload = {
 *   title: '株価アラート',
 *   body: 'AAPL が目標価格に到達しました',
 * };
 * const success = await sendNotification(alert, payload);
 * ```
 */
export async function sendNotification(
  alert: Alert,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    // VAPID キーの設定（初回のみ実行）
    configureVapidKeys();

    // サブスクリプション情報を構築
    const subscription = {
      endpoint: alert.SubscriptionEndpoint,
      keys: {
        p256dh: alert.SubscriptionKeysP256dh,
        auth: alert.SubscriptionKeysAuth,
      },
    };

    // Web Push 通知を送信
    const response = await webpush.sendNotification(subscription, JSON.stringify(payload));

    logger.info('Web Push 通知を送信しました', {
      alertId: alert.AlertID,
      userId: alert.UserID,
      tickerId: alert.TickerID,
      statusCode: response.statusCode,
      endpoint: alert.SubscriptionEndpoint,
    });

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 410 Gone: サブスクリプションが無効化されている
    // 404 Not Found: サブスクリプションが存在しない
    if (errorMessage.includes('410') || errorMessage.includes('404')) {
      logger.warn('無効な Web Push サブスクリプションです', {
        alertId: alert.AlertID,
        userId: alert.UserID,
        error: errorMessage,
      });
    } else {
      logger.error('Web Push 通知の送信に失敗しました', {
        alertId: alert.AlertID,
        userId: alert.UserID,
        error: errorMessage,
      });
    }

    return false;
  }
}

/**
 * アラート通知のペイロードを生成する
 *
 * @param alert - アラート情報
 * @param currentPrice - 現在価格
 * @returns 通知ペイロード
 */
export function createAlertNotificationPayload(
  alert: Alert,
  currentPrice: number
): NotificationPayload {
  const mode = alert.Mode === 'Buy' ? '買い' : '売り';

  let body: string;
  let targetPrice: number;

  if (alert.ConditionList.length === 2) {
    // 複数条件の場合
    const gteCondition = alert.ConditionList.find((c) => c.operator === 'gte');
    const lteCondition = alert.ConditionList.find((c) => c.operator === 'lte');

    if (!gteCondition || !lteCondition) {
      throw new Error('複数条件のアラートには gte と lte が必要です');
    }

    if (alert.LogicalOperator === 'AND') {
      // 範囲内アラート
      body = `現在価格 $${currentPrice.toFixed(2)} が範囲 $${gteCondition.value.toFixed(2)}〜$${lteCondition.value.toFixed(2)} 内になりました`;
      targetPrice = gteCondition.value; // 下限を代表値とする
    } else if (alert.LogicalOperator === 'OR') {
      // 範囲外アラート
      body = `現在価格 $${currentPrice.toFixed(2)} が範囲外（$${lteCondition.value.toFixed(2)} 以下 または $${gteCondition.value.toFixed(2)} 以上）になりました`;
      targetPrice = gteCondition.value; // 上限を代表値とする
    } else {
      throw new Error('無効な LogicalOperator です');
    }
  } else {
    // 単一条件の場合（従来通り）
    const condition = alert.ConditionList[0];
    const operatorText = condition.operator === 'gte' ? '以上' : '以下';
    body = `現在価格 $${currentPrice.toFixed(2)} が目標価格 $${condition.value.toFixed(2)} ${operatorText}になりました`;
    targetPrice = condition.value;
  }

  return {
    title: `${mode}アラート: ${alert.TickerID}`,
    body,
    icon: '/icon-192x192.png',
    data: {
      alertId: alert.AlertID,
      tickerId: alert.TickerID,
      mode: alert.Mode,
      currentPrice,
      targetPrice,
    },
  };
}
