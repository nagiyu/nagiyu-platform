import { sendWebPushNotification } from '@nagiyu/common/push';
import type { NotificationPayload, VapidConfig } from '@nagiyu/common/push';
import type { PushSubscriptionRepository } from './subscription-repository.js';

const DEFAULT_VAPID_SUBJECT = 'mailto:noreply@nagiyu.com';

/** @nagiyu/admin-core の後方互換性のために残している型エイリアス */
export type PushNotificationPayload = NotificationPayload;

export type SendAllResult = {
  sent: number;
  failed: number;
};

type WebPushSenderOptions = {
  repository: PushSubscriptionRepository;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject?: string;
};

export class WebPushSender {
  private readonly repository: PushSubscriptionRepository;
  private readonly vapidConfig: VapidConfig;

  constructor(options: WebPushSenderOptions) {
    this.repository = options.repository;
    this.vapidConfig = {
      publicKey: options.vapidPublicKey,
      privateKey: options.vapidPrivateKey,
      subject: options.vapidSubject ?? DEFAULT_VAPID_SUBJECT,
    };
  }

  public async sendAll(payload: PushNotificationPayload): Promise<SendAllResult> {
    const subscriptions = await this.repository.findAll();
    if (subscriptions.length === 0) {
      return { sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;

    for (const subscription of subscriptions) {
      try {
        const success = await sendWebPushNotification(
          subscription.subscription,
          payload,
          this.vapidConfig
        );
        if (success) {
          sent += 1;
        } else {
          failed += 1;
          await this.repository.deleteByEndpoint(subscription.subscription.endpoint);
        }
      } catch {
        failed += 1;
      }
    }

    return { sent, failed };
  }
}
