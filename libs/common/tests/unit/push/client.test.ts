import webpush from 'web-push';
import { logger } from '../../../src/logger/index.js';
import { sendWebPushNotification } from '../../../src/push/client.js';
import type { NotificationPayload, PushSubscription, VapidConfig } from '../../../src/push/types.js';

describe('sendWebPushNotification', () => {
  const subscription: PushSubscription = {
    endpoint: 'https://example.com/push',
    keys: {
      p256dh: 'p256dh-key',
      auth: 'auth-key',
    },
  };

  const payload: NotificationPayload = {
    title: '通知タイトル',
    body: '通知本文',
    icon: '/icon-192x192.png',
    data: { key: 'value' },
  };

  const vapidConfig: VapidConfig = {
    publicKey:
      'BEl62iUYgUivjCD3XPAUjcR-m9WwRhtgyMIEqKxOX9FvN7dHFisG_V_A75MvqMaI-MgCYB2EnKMb8mQaHjgzy18',
    privateKey: '5MByveLiA8z8Q-yjA4vuk2N43N03p9qi8u4XW8yfXYo',
    subject: 'mailto:test@example.com',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('送信成功時に true を返し info ログを出力する', async () => {
    jest.spyOn(webpush, 'setVapidDetails').mockImplementation();
    jest.spyOn(webpush, 'sendNotification').mockResolvedValue({
      statusCode: 201,
      headers: {},
      body: '',
    });
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation();

    const result = await sendWebPushNotification(subscription, payload, vapidConfig);

    expect(result).toBe(true);
    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      vapidConfig.subject,
      vapidConfig.publicKey,
      vapidConfig.privateKey
    );
    expect(webpush.sendNotification).toHaveBeenCalledWith(subscription, JSON.stringify(payload));
    expect(infoSpy).toHaveBeenCalledWith('Web Push 通知を送信しました', {
      statusCode: 201,
      endpoint: subscription.endpoint,
    });
  });

  test('404 エラー時に warn ログを出して false を返す', async () => {
    jest.spyOn(webpush, 'setVapidDetails').mockImplementation();
    jest.spyOn(webpush, 'sendNotification').mockRejectedValue(new Error('404 Not Found'));
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation();

    const result = await sendWebPushNotification(subscription, payload, vapidConfig);

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith('無効な Web Push サブスクリプションです', {
      error: '404 Not Found',
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test('410 エラー時に warn ログを出して false を返す', async () => {
    jest.spyOn(webpush, 'setVapidDetails').mockImplementation();
    jest
      .spyOn(webpush, 'sendNotification')
      .mockRejectedValue(new Error('410 Gone: subscription is invalid'));
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();

    const result = await sendWebPushNotification(subscription, payload, vapidConfig);

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith('無効な Web Push サブスクリプションです', {
      error: '410 Gone: subscription is invalid',
    });
  });

  test('404/410 以外のエラー時に error ログを出して false を返す', async () => {
    jest.spyOn(webpush, 'setVapidDetails').mockImplementation();
    jest.spyOn(webpush, 'sendNotification').mockRejectedValue(new Error('network timeout'));
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation();

    const result = await sendWebPushNotification(subscription, payload, vapidConfig);

    expect(result).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('Web Push 通知の送信に失敗しました', {
      error: 'network timeout',
    });
  });

  test('VAPID 設定が不足している場合は例外を投げる', async () => {
    const invalidConfig: VapidConfig = {
      publicKey: ' ',
      privateKey: vapidConfig.privateKey,
      subject: vapidConfig.subject,
    };

    await expect(sendWebPushNotification(subscription, payload, invalidConfig)).rejects.toThrow(
      'VAPID キーが設定されていません'
    );
  });
});
