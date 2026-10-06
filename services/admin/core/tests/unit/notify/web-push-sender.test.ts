import { describe, it, expect, beforeEach } from '@jest/globals';
import type {
  PushSubscriptionRecord,
  PushSubscriptionRepository,
} from '../../../src/notify/subscription-repository.js';
import { WebPushSender } from '../../../src/notify/web-push-sender.js';
import { logger } from '@nagiyu/common';
import { sendWebPushNotification, type VapidConfig } from '@nagiyu/common/push';

jest.mock('@nagiyu/common', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  toErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

/**
 * sendWebPushNotifications は単体送信 (sendWebPushNotification) を逐次呼ぶ実装を模す。
 * 共通ライブラリ内部の import はモックできないため、ここで同じ振る舞いを再現する。
 */
jest.mock('@nagiyu/common/push', () => {
  const sendWebPushNotification = jest.fn();
  return {
    sendWebPushNotification,
    getVapidConfig: jest.fn(() => ({
      publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
      privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
      subject: 'mailto:support@nagiyu.com',
    })),
    sendWebPushNotifications: async (
      targets: unknown[],
      toSubscription: (target: unknown) => unknown,
      payload: unknown,
      vapidConfig: unknown
    ) => {
      const result = { sent: [] as unknown[], invalid: [] as unknown[], failed: [] as unknown[] };
      for (const target of targets) {
        try {
          const ok = await sendWebPushNotification(toSubscription(target), payload, vapidConfig);
          (ok ? result.sent : result.invalid).push(target);
        } catch (error) {
          result.failed.push({ target, error });
        }
      }
      return result;
    },
  };
});

const mockSendWebPushNotification = sendWebPushNotification as jest.Mock;

const vapidConfig: VapidConfig = {
  publicKey: 'public',
  privateKey: 'private',
  subject: 'mailto:support@nagiyu.com',
};

function createSubscription(endpoint: string): PushSubscriptionRecord {
  return {
    subscriptionId: `sub-${endpoint}`,
    userId: 'admin-user-1',
    subscription: {
      endpoint,
      keys: {
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('WebPushSender', () => {
  let subscriptions: PushSubscriptionRecord[];
  let deletedEndpoints: string[];
  let repository: PushSubscriptionRepository;

  beforeEach(() => {
    subscriptions = [createSubscription('https://example.com/subscription-1')];
    deletedEndpoints = [];
    mockSendWebPushNotification.mockReset();

    repository = {
      save: async () => {
        throw new Error('not implemented in this test');
      },
      findAll: async () => subscriptions,
      deleteByEndpoint: async (endpoint: string) => {
        deletedEndpoints.push(endpoint);
        return 1;
      },
    };
  });

  it('通知送信成功時に件数を返す', async () => {
    mockSendWebPushNotification.mockResolvedValue(true);

    const sender = new WebPushSender({
      repository,
      vapidConfig,
    });

    const result = await sender.sendAll({
      title: 'アラーム通知',
      body: 'CloudWatch Alarm が発火しました',
    });

    expect(result).toEqual({ sent: 1, invalid: 0, failed: 0 });
    expect(mockSendWebPushNotification).toHaveBeenCalledTimes(1);
  });

  it('410 Gone のときにサブスクリプションを削除する', async () => {
    mockSendWebPushNotification.mockResolvedValue(false);

    const sender = new WebPushSender({
      repository,
      vapidConfig,
    });

    const result = await sender.sendAll({
      title: 'アラーム通知',
      body: 'CloudWatch Alarm が発火しました',
    });

    expect(result).toEqual({ sent: 0, invalid: 1, failed: 0 });
    expect(deletedEndpoints).toEqual(['https://example.com/subscription-1']);
  });

  it('サブスクリプションが0件の場合は送信しない', async () => {
    subscriptions = [];

    const sender = new WebPushSender({
      repository,
      vapidConfig,
    });

    const result = await sender.sendAll({
      title: 'アラーム通知',
      body: 'CloudWatch Alarm が発火しました',
    });

    expect(result).toEqual({ sent: 0, invalid: 0, failed: 0 });
    expect(mockSendWebPushNotification).not.toHaveBeenCalled();
  });

  it('404/410以外のエラーでは削除しない', async () => {
    mockSendWebPushNotification.mockRejectedValue(new Error('network timeout'));

    const sender = new WebPushSender({
      repository,
      vapidConfig,
    });

    const result = await sender.sendAll({
      title: 'アラーム通知',
      body: 'CloudWatch Alarm が発火しました',
    });

    expect(result).toEqual({ sent: 0, invalid: 0, failed: 1 });
    expect(deletedEndpoints).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith('Web Push 送信に失敗しました', {
      endpoint: 'https://example.com/subscription-1',
      error: 'network timeout',
    });
  });

  it('vapidConfig 省略時は環境変数から VAPID 設定を読む', async () => {
    process.env.VAPID_PUBLIC_KEY = 'env-public';
    process.env.VAPID_PRIVATE_KEY = 'env-private';
    mockSendWebPushNotification.mockResolvedValue(true);

    try {
      const sender = new WebPushSender({ repository });
      await sender.sendAll({ title: 't', body: 'b' });
    } finally {
      delete process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;
    }

    expect(mockSendWebPushNotification.mock.calls[0][2]).toEqual({
      publicKey: 'env-public',
      privateKey: 'env-private',
      subject: 'mailto:support@nagiyu.com',
    });
  });

  it.each([
    ['公開鍵', { ...vapidConfig, publicKey: '' }],
    ['秘密鍵', { ...vapidConfig, privateKey: '' }],
  ])('%s が空ならコンストラクタで例外を投げる', (_name, config) => {
    expect(() => new WebPushSender({ repository, vapidConfig: config })).toThrow(
      'VAPID キーが設定されていません'
    );
  });
});
