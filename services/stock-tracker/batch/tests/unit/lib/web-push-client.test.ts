/**
 * Unit tests for web-push-client
 */

import {
  sendNotification,
  createAlertNotificationPayload,
} from '../../../src/lib/web-push-client.js';
import webpush from 'web-push';
import type { Alert } from '@nagiyu/stock-tracker-core';

// モックの設定
jest.mock('web-push');

describe('web-push-client', () => {
  let mockAlert: Alert;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock environment variables
    process.env.VAPID_PUBLIC_KEY = 'test-public-key';
    process.env.VAPID_PRIVATE_KEY = 'test-private-key';

    // Mock alert
    mockAlert = {
      AlertID: 'alert-1',
      UserID: 'user-1',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Mode: 'Sell',
      Frequency: 'MINUTE_LEVEL',
      Enabled: true,
      ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
      SubscriptionEndpoint: 'https://fcm.googleapis.com/fcm/send/test',
      SubscriptionKeysP256dh: 'test-p256dh',
      SubscriptionKeysAuth: 'test-auth',
      CreatedAt: Date.now(),
      UpdatedAt: Date.now(),
    };
  });

  afterEach(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  describe('sendNotification', () => {
    it('Web Push 通知を正常に送信する', async () => {
      // Arrange
      const payload = {
        title: 'Test Alert',
        body: 'Test body',
      };
      (webpush.sendNotification as jest.Mock).mockResolvedValue({});

      // Act
      const result = await sendNotification(mockAlert, payload);

      // Assert
      expect(result).toBe(true);
      expect(webpush.setVapidDetails).toHaveBeenCalledWith(
        'mailto:support@nagiyu.com',
        'test-public-key',
        'test-private-key'
      );
      expect(webpush.sendNotification).toHaveBeenCalledWith(
        {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        },
        JSON.stringify(payload)
      );
    });

    it('無効なサブスクリプション (410 Gone) の場合、false を返す', async () => {
      // Arrange
      const payload = {
        title: 'Test Alert',
        body: 'Test body',
      };
      (webpush.sendNotification as jest.Mock).mockRejectedValue(new Error('410 Gone'));

      // Act
      const result = await sendNotification(mockAlert, payload);

      // Assert
      expect(result).toBe(false);
    });

    it('存在しないサブスクリプション (404 Not Found) の場合、false を返す', async () => {
      // Arrange
      const payload = {
        title: 'Test Alert',
        body: 'Test body',
      };
      (webpush.sendNotification as jest.Mock).mockRejectedValue(new Error('404 Not Found'));

      // Act
      const result = await sendNotification(mockAlert, payload);

      // Assert
      expect(result).toBe(false);
    });

    it('通知送信エラー (その他のエラー) の場合、false を返す', async () => {
      // Arrange
      const payload = {
        title: 'Test Alert',
        body: 'Test body',
      };
      (webpush.sendNotification as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Act
      const result = await sendNotification(mockAlert, payload);

      // Assert
      expect(result).toBe(false);
    });

    it('VAPID キーが未設定の場合、エラーをスローする', async () => {
      // Arrange
      delete process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;
      const payload = {
        title: 'Test Alert',
        body: 'Test body',
      };

      // Act & Assert
      await expect(sendNotification(mockAlert, payload)).resolves.toBe(false);
    });
  });

  describe('createAlertNotificationPayload', () => {
    it('売りアラートの通知ペイロードを生成する (gte)', () => {
      // Arrange
      const currentPrice = 205.5;
      const condition = { operator: 'gte', value: 200.0 };

      // Act
      const payload = createAlertNotificationPayload(mockAlert, currentPrice, condition);

      // Assert
      expect(payload).toEqual({
        title: '売りアラート: NSDQ:AAPL',
        body: '現在価格 $205.50 が目標価格 $200.00 以上になりました',
        icon: '/icon-192x192.png',
        data: {
          alertId: 'alert-1',
          tickerId: 'NSDQ:AAPL',
          mode: 'Sell',
          currentPrice: 205.5,
          targetPrice: 200.0,
        },
      });
    });

    it('買いアラートの通知ペイロードを生成する (lte)', () => {
      // Arrange
      const buyAlert: Alert = {
        ...mockAlert,
        Mode: 'Buy',
      };
      const currentPrice = 145.25;
      const condition = { operator: 'lte', value: 150.0 };

      // Act
      const payload = createAlertNotificationPayload(buyAlert, currentPrice, condition);

      // Assert
      expect(payload).toEqual({
        title: '買いアラート: NSDQ:AAPL',
        body: '現在価格 $145.25 が目標価格 $150.00 以下になりました',
        icon: '/icon-192x192.png',
        data: {
          alertId: 'alert-1',
          tickerId: 'NSDQ:AAPL',
          mode: 'Buy',
          currentPrice: 145.25,
          targetPrice: 150.0,
        },
      });
    });

    it('小数点以下の価格を正しくフォーマットする', () => {
      // Arrange
      const currentPrice = 123.456;
      const condition = { operator: 'gte', value: 123.45 };

      // Act
      const payload = createAlertNotificationPayload(mockAlert, currentPrice, condition);

      // Assert
      expect(payload.body).toContain('$123.46'); // 四捨五入される
      expect(payload.body).toContain('$123.45');
    });
  });
});
