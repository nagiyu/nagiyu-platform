import * as webpush from 'web-push';
import { logger } from '../logger/index.js';
import { checkPushEndpoint } from '../push-subscription/endpoint.js';
import { normalizeVapidKey } from './vapid.js';
import type { NotificationPayload, PushSubscription, VapidConfig } from './types.js';

const ERROR_MESSAGES = {
  VAPID_NOT_CONFIGURED: 'VAPID キーが設定されていません',
  ENDPOINT_NOT_ALLOWED: '許可されていない Push endpoint のため送信しません',
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

  // web-push は endpoint のスキームを見ず hostname と port だけで常に https 送信するため、
  // 登録時の検証を通っていない保存済みの購読が送信のたびに任意の宛先へ飛ぶ。
  // false は呼び出し側で「無効な購読」として扱われ削除されるので、データ移行なしで不正な購読が片付く。
  const endpointCheck = checkPushEndpoint(subscription.endpoint);
  if (!endpointCheck.allowed) {
    // endpoint 全体は宛先の情報を含むためログに出さず、理由とホスト名だけにする
    logger.warn(ERROR_MESSAGES.ENDPOINT_NOT_ALLOWED, {
      reason: endpointCheck.reason,
      ...(endpointCheck.reason === 'HOST_NOT_ALLOWED' ? { hostname: endpointCheck.hostname } : {}),
    });
    return false;
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
