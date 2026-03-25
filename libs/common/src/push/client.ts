import webpush from 'web-push';
import { logger } from '../logger/index.js';
import { normalizeVapidKey } from './vapid.js';
import type { NotificationPayload, PushSubscription, VapidConfig } from './types.js';

const ERROR_MESSAGES = {
  VAPID_NOT_CONFIGURED: 'VAPID キーが設定されていません',
} as const;

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
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('410') || errorMessage.includes('404')) {
      logger.warn('無効な Web Push サブスクリプションです', {
        error: errorMessage,
      });
    } else {
      logger.error('Web Push 通知の送信に失敗しました', {
        error: errorMessage,
      });
    }

    return false;
  }
}
