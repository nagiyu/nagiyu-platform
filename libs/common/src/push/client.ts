import webpush from 'web-push';
import { logger } from '../logger/index.js';
import { normalizeVapidKey } from './vapid.js';
import type { NotificationPayload, PushSubscription, VapidConfig } from './types.js';

const ERROR_MESSAGES = {
  VAPID_NOT_CONFIGURED: 'VAPID キーが設定されていません',
} as const;

type WebPushError = {
  statusCode?: number;
  message?: string;
};

/**
 * Web Push エラーが「無効なサブスクリプション」を示すか判定する。
 * statusCode がある場合はそれを優先し、ない場合のみメッセージを補助的に判定する。
 */
function isInvalidSubscriptionError(statusCode: number | undefined, errorMessage: string): boolean {
  if (typeof statusCode === 'number') {
    return statusCode === 404 || statusCode === 410;
  }

  return /\b(404|410)\b/.test(errorMessage);
}

export async function sendWebPushNotification(
  subscription: PushSubscription,
  payload: NotificationPayload,
  vapidConfig: VapidConfig
): Promise<boolean> {
  const normalizedPublicKey = normalizeVapidKey(vapidConfig.publicKey, 'publicKey');
  const normalizedPrivateKey = normalizeVapidKey(vapidConfig.privateKey, 'privateKey');
  const subject = vapidConfig.subject.trim();

  if (!normalizedPublicKey || !normalizedPrivateKey || !subject) {
    throw new Error(ERROR_MESSAGES.VAPID_NOT_CONFIGURED);
  }

  try {
    webpush.setVapidDetails(subject, normalizedPublicKey, normalizedPrivateKey);
    const response = await webpush.sendNotification(subscription, JSON.stringify(payload));

    logger.info('Web Push 通知を送信しました', {
      statusCode: response.statusCode,
      endpoint: subscription.endpoint,
    });

    return true;
  } catch (error) {
    const webPushError = error as WebPushError;
    const statusCode = webPushError.statusCode;
    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof webPushError.message === 'string'
          ? webPushError.message
          : String(error);
    const isInvalidSubscription = isInvalidSubscriptionError(statusCode, errorMessage);

    if (isInvalidSubscription) {
      logger.warn('無効な Web Push サブスクリプションです', {
        statusCode,
        error: errorMessage,
      });
      return false;
    } else {
      logger.error('Web Push 通知の送信に失敗しました', {
        statusCode,
        error: errorMessage,
      });
      throw error;
    }
  }
}
