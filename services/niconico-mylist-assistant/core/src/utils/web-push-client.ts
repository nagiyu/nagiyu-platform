/**
 * Web Push 通知送信クライアント
 * Web Push API を使用してブラウザ通知を送信する
 */

import webpush from 'web-push';

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
 * Push サブスクリプション情報
 */
export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * VAPID キーを環境変数から取得して設定する
 *
 * @throws {Error} VAPID キーが未設定の場合
 */
let vapidConfigured = false;

function configureVapidKeys(): void {
  // 既に設定済みの場合はスキップ
  if (vapidConfigured) {
    return;
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    throw new Error(ERROR_MESSAGES.VAPID_NOT_CONFIGURED);
  }

  webpush.setVapidDetails('mailto:noreply@nagiyu.com', publicKey, privateKey);
  vapidConfigured = true;
}

/**
 * Web Push 通知を送信する
 *
 * @param subscription - Push サブスクリプション情報
 * @param payload - 通知ペイロード
 * @returns 送信成功時は true、失敗時は false
 *
 * @example
 * ```typescript
 * const subscription: PushSubscription = { ... };
 * const payload = {
 *   title: 'バッチ完了',
 *   body: 'マイリスト登録が完了しました',
 * };
 * const success = await sendNotification(subscription, payload);
 * ```
 */
export async function sendNotification(
  subscription: PushSubscription,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    // VAPID キーの設定（初回のみ実行）
    configureVapidKeys();

    // Web Push 通知を送信
    const response = await webpush.sendNotification(subscription, JSON.stringify(payload));

    console.log('Web Push 通知を送信しました', {
      statusCode: response.statusCode,
      endpoint: subscription.endpoint,
    });

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 410 Gone: サブスクリプションが無効化されている
    // 404 Not Found: サブスクリプションが存在しない
    if (errorMessage.includes('410') || errorMessage.includes('404')) {
      console.warn('無効な Web Push サブスクリプションです', {
        error: errorMessage,
      });
    } else {
      console.error('Web Push 通知の送信に失敗しました', {
        error: errorMessage,
      });
    }

    return false;
  }
}

/**
 * バッチ完了通知のペイロードを生成する
 *
 * @param jobId - ジョブID
 * @param registeredCount - 登録成功件数
 * @param failedCount - 登録失敗件数
 * @param totalCount - 総件数
 * @returns 通知ペイロード
 */
export function createBatchCompletionPayload(
  jobId: string,
  registeredCount: number,
  failedCount: number,
  totalCount: number
): NotificationPayload {
  const successRate = totalCount > 0 ? Math.round((registeredCount / totalCount) * 100) : 0;

  let body: string;
  if (failedCount === 0) {
    body = `全 ${totalCount} 件のマイリスト登録が完了しました`;
  } else if (registeredCount === 0) {
    body = `マイリスト登録に失敗しました（${failedCount} 件）`;
  } else {
    body = `${registeredCount} 件登録完了、${failedCount} 件失敗（成功率 ${successRate}%）`;
  }

  return {
    title: 'マイリスト登録完了',
    body,
    icon: '/icon-192x192.png',
    data: {
      jobId,
      registeredCount,
      failedCount,
      totalCount,
      type: 'batch-completion',
    },
  };
}
