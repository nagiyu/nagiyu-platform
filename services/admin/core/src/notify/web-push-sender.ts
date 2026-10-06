import { logger, toErrorMessage } from '@nagiyu/common';
import { getVapidConfig, sendWebPushNotifications } from '@nagiyu/common/push';
import type { NotificationPayload, VapidConfig } from '@nagiyu/common/push';
import type { PushSubscriptionRepository } from './subscription-repository.js';

const ERROR_MESSAGES = {
  VAPID_KEYS_REQUIRED: 'VAPID キーが設定されていません',
} as const;

/** @nagiyu/admin-core の後方互換性のために残している型エイリアス */
export type PushNotificationPayload = NotificationPayload;

export type SendAllResult = {
  sent: number;
  invalid: number;
  /** 例外で送信できなかった件数。無効な購読は invalid に数える */
  failed: number;
};

type WebPushSenderOptions = {
  repository: PushSubscriptionRepository;
  /** 省略時は環境変数から getVapidConfig で組み立てる */
  vapidConfig?: VapidConfig;
};

export class WebPushSender {
  private readonly repository: PushSubscriptionRepository;
  private readonly vapidConfig: VapidConfig;

  /**
   * @throws VAPID の公開鍵か秘密鍵が空の場合。送信直前ではなく生成時に失敗させ、
   *         呼び出し側が購読取得などの副作用を起こす前に設定不備を検知できるようにする
   */
  constructor(options: WebPushSenderOptions) {
    this.repository = options.repository;
    this.vapidConfig = options.vapidConfig ?? getVapidConfig();

    if (!this.vapidConfig.publicKey || !this.vapidConfig.privateKey) {
      throw new Error(ERROR_MESSAGES.VAPID_KEYS_REQUIRED);
    }
  }

  public async sendAll(payload: PushNotificationPayload): Promise<SendAllResult> {
    const subscriptions = await this.repository.findAll();
    if (subscriptions.length === 0) {
      return { sent: 0, invalid: 0, failed: 0 };
    }

    const result = await sendWebPushNotifications(
      subscriptions,
      (record) => record.subscription,
      payload,
      this.vapidConfig
    );

    for (const record of result.invalid) {
      await this.repository.deleteByEndpoint(record.subscription.endpoint);
    }

    for (const { target, error } of result.failed) {
      logger.warn('Web Push 送信に失敗しました', {
        endpoint: target.subscription.endpoint,
        error: toErrorMessage(error),
      });
    }

    return {
      sent: result.sent.length,
      invalid: result.invalid.length,
      failed: result.failed.length,
    };
  }
}
