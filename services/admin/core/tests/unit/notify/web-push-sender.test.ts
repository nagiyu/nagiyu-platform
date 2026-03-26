import { describe, it, expect, beforeEach } from '@jest/globals';
import type {
  PushSubscriptionRecord,
  PushSubscriptionRepository,
} from '../../../src/notify/subscription-repository.js';
import { WebPushSender } from '../../../src/notify/web-push-sender.js';

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
    const setVapidDetails = jest.fn();
    const sendNotification = jest.fn().mockResolvedValue({ statusCode: 201 });

    const sender = new WebPushSender({
      repository,
      vapidPublicKey:
        'BEl62iUYgUivjCD3XPAUjcR-m9WwRhtgyMIEqKxOX9FvN7dHFisG_V_A75MvqMaI-MgCYB2EnKMb8mQaHjgzy18',
      vapidPrivateKey: '5MByveLiA8z8Q-yjA4vuk2N43N03p9qi8u4XW8yfXYo',
      client: {
        setVapidDetails,
        sendNotification,
      },
    });

    const result = await sender.sendAll({
      title: 'アラーム通知',
      body: 'CloudWatch Alarm が発火しました',
    });

    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(setVapidDetails).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('410 Gone のときにサブスクリプションを削除する', async () => {
    const sender = new WebPushSender({
      repository,
      vapidPublicKey:
        'BEl62iUYgUivjCD3XPAUjcR-m9WwRhtgyMIEqKxOX9FvN7dHFisG_V_A75MvqMaI-MgCYB2EnKMb8mQaHjgzy18',
      vapidPrivateKey: '5MByveLiA8z8Q-yjA4vuk2N43N03p9qi8u4XW8yfXYo',
      client: {
        setVapidDetails: jest.fn(),
        sendNotification: jest.fn().mockRejectedValue({ statusCode: 410 }),
      },
    });

    const result = await sender.sendAll({
      title: 'アラーム通知',
      body: 'CloudWatch Alarm が発火しました',
    });

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(deletedEndpoints).toEqual(['https://example.com/subscription-1']);
  });

  it('サブスクリプションが0件の場合は送信しない', async () => {
    subscriptions = [];
    const sendNotification = jest.fn();

    const sender = new WebPushSender({
      repository,
      vapidPublicKey:
        'BEl62iUYgUivjCD3XPAUjcR-m9WwRhtgyMIEqKxOX9FvN7dHFisG_V_A75MvqMaI-MgCYB2EnKMb8mQaHjgzy18',
      vapidPrivateKey: '5MByveLiA8z8Q-yjA4vuk2N43N03p9qi8u4XW8yfXYo',
      client: {
        setVapidDetails: jest.fn(),
        sendNotification,
      },
    });

    const result = await sender.sendAll({
      title: 'アラーム通知',
      body: 'CloudWatch Alarm が発火しました',
    });

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('404/410以外のエラーでは削除しない', async () => {
    const sender = new WebPushSender({
      repository,
      vapidPublicKey:
        'BEl62iUYgUivjCD3XPAUjcR-m9WwRhtgyMIEqKxOX9FvN7dHFisG_V_A75MvqMaI-MgCYB2EnKMb8mQaHjgzy18',
      vapidPrivateKey: '5MByveLiA8z8Q-yjA4vuk2N43N03p9qi8u4XW8yfXYo',
      client: {
        setVapidDetails: jest.fn(),
        sendNotification: jest.fn().mockRejectedValue(new Error('network timeout')),
      },
    });

    const result = await sender.sendAll({
      title: 'アラーム通知',
      body: 'CloudWatch Alarm が発火しました',
    });

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(deletedEndpoints).toEqual([]);
  });
});
