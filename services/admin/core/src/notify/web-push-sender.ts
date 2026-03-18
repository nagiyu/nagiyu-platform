import type { PushSubscription } from '@nagiyu/common';
import { normalizeVapidKey } from '@nagiyu/common';
import webPush from 'web-push';
import type {
  PushSubscriptionRecord,
  PushSubscriptionRepository,
} from './subscription-repository.js';

const DEFAULT_VAPID_SUBJECT = 'mailto:support@nagiyu.com';

export type PushNotificationPayload = {
  title: string;
  body: string;
  icon?: string;
  data?: Record<string, unknown>;
};

export type SendAllResult = {
  sent: number;
  failed: number;
};

export type WebPushClient = {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(
    subscription: PushSubscription,
    payload?: string
  ): Promise<{ statusCode?: number } | void>;
};

type WebPushSenderOptions = {
  repository: PushSubscriptionRepository;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject?: string;
  client?: WebPushClient;
};

export class WebPushSender {
  private readonly repository: PushSubscriptionRepository;
  private readonly vapidPublicKey: string;
  private readonly vapidPrivateKey: string;
  private readonly vapidSubject: string;
  private readonly client: WebPushClient;

  constructor(options: WebPushSenderOptions) {
    this.repository = options.repository;
    this.vapidPublicKey = normalizeVapidKey(options.vapidPublicKey, 'publicKey');
    this.vapidPrivateKey = normalizeVapidKey(options.vapidPrivateKey, 'privateKey');
    this.vapidSubject = options.vapidSubject ?? DEFAULT_VAPID_SUBJECT;
    this.client = options.client ?? webPush;
  }

  public async sendAll(payload: PushNotificationPayload): Promise<SendAllResult> {
    const subscriptions = await this.repository.findAll();
    if (subscriptions.length === 0) {
      return { sent: 0, failed: 0 };
    }

    this.client.setVapidDetails(this.vapidSubject, this.vapidPublicKey, this.vapidPrivateKey);

    let sent = 0;
    let failed = 0;
    const encodedPayload = JSON.stringify(payload);

    for (const subscription of subscriptions) {
      try {
        await this.client.sendNotification(toPushSubscription(subscription), encodedPayload);
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode = getStatusCode(error);
        if (statusCode === 404 || statusCode === 410) {
          await this.repository.deleteByEndpoint(subscription.endpoint);
        }
      }
    }

    return { sent, failed };
  }
}

function toPushSubscription(record: PushSubscriptionRecord): PushSubscription {
  return {
    endpoint: record.endpoint,
    keys: {
      p256dh: record.keys.p256dh,
      auth: record.keys.auth,
    },
  };
}

function getStatusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('statusCode' in error)) {
    return null;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === 'number' ? statusCode : null;
}
