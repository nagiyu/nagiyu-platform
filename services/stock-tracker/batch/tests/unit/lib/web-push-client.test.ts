/**
 * Unit tests for web-push-client
 */

import {
  sendNotification,
  createAlertNotificationPayload,
} from '../../../src/lib/web-push-client.js';
import { normalizeVapidKey } from '@nagiyu/common';
import type { Alert } from '@nagiyu/stock-tracker-core';

const mockSendWebPushNotification = jest.fn();
jest.mock('@nagiyu/common/push', () => ({
  sendWebPushNotification: (...args: unknown[]) => mockSendWebPushNotification(...args),
}));

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
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test',
        keys: {
          p256dh: 'test-p256dh',
          auth: 'test-auth',
        },
      },
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
      mockSendWebPushNotification.mockResolvedValue(true);

      // Act
      const result = await sendNotification(mockAlert, payload);

      // Assert
      expect(result).toBe(true);
      expect(mockSendWebPushNotification).toHaveBeenCalledWith(
        mockAlert.subscription,
        payload,
        {
          publicKey: 'test-public-key',
          privateKey: 'test-private-key',
          subject: 'mailto:support@nagiyu.com',
        }
      );
    });

    it('無効なサブスクリプション (410 Gone) の場合、false を返す', async () => {
      // Arrange
      const payload = {
        title: 'Test Alert',
        body: 'Test body',
      };
      mockSendWebPushNotification.mockResolvedValue(false);

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
      mockSendWebPushNotification.mockResolvedValue(false);

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
      mockSendWebPushNotification.mockResolvedValue(false);

      // Act
      const result = await sendNotification(mockAlert, payload);

      // Assert
      expect(result).toBe(false);
    });

    it('VAPID キーが未設定の場合でも共通クライアントに委譲し、戻り値を返す', async () => {
      // Arrange
      delete process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;
      const payload = {
        title: 'Test Alert',
        body: 'Test body',
      };
      mockSendWebPushNotification.mockResolvedValue(false);

      // Act & Assert
      await expect(sendNotification(mockAlert, payload)).resolves.toBe(false);
      expect(mockSendWebPushNotification).toHaveBeenCalledWith(
        mockAlert.subscription,
        payload,
        {
          publicKey: '',
          privateKey: '',
          subject: 'mailto:support@nagiyu.com',
        }
      );
    });
  });

  describe('createAlertNotificationPayload', () => {
    it('売りアラートの通知ペイロードを生成する (gte)', () => {
      // Arrange
      const currentPrice = 205.5;

      // Act
      const payload = createAlertNotificationPayload(mockAlert, currentPrice);

      // Assert
      expect(payload).toEqual({
        title: '売りアラート: NSDQ:AAPL',
        body: '現在価格 $205.50 が目標価格 $200.00 以上になりました',
        icon: '/icon-192x192.png',
        data: {
          alertId: 'alert-1',
          exchangeId: 'NASDAQ',
          tickerId: 'NSDQ:AAPL',
          mode: 'Sell',
          currentPrice: 205.5,
          targetPrice: 200.0,
          url: '/?exchangeId=NASDAQ&tickerId=NSDQ%3AAAPL',
        },
      });
    });

    it('買いアラートの通知ペイロードを生成する (lte)', () => {
      // Arrange
      const buyAlert: Alert = {
        ...mockAlert,
        Mode: 'Buy',
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
      };
      const currentPrice = 145.25;

      // Act
      const payload = createAlertNotificationPayload(buyAlert, currentPrice);

      // Assert
      expect(payload).toEqual({
        title: '買いアラート: NSDQ:AAPL',
        body: '現在価格 $145.25 が目標価格 $150.00 以下になりました',
        icon: '/icon-192x192.png',
        data: {
          alertId: 'alert-1',
          exchangeId: 'NASDAQ',
          tickerId: 'NSDQ:AAPL',
          mode: 'Buy',
          currentPrice: 145.25,
          targetPrice: 150.0,
          url: '/?exchangeId=NASDAQ&tickerId=NSDQ%3AAAPL',
        },
      });
    });

    it('小数点以下の価格を正しくフォーマットする', () => {
      // Arrange
      const currentPrice = 123.456;
      const alert: Alert = {
        ...mockAlert,
        ConditionList: [{ field: 'price', operator: 'gte', value: 123.45 }],
      };

      // Act
      const payload = createAlertNotificationPayload(alert, currentPrice);

      // Assert
      expect(payload.body).toContain('$123.46'); // 四捨五入される
      expect(payload.body).toContain('$123.45');
    });

    it('範囲内アラート（AND）の通知ペイロードを生成する', () => {
      // Arrange
      const rangeAlert: Alert = {
        ...mockAlert,
        ConditionList: [
          { field: 'price', operator: 'gte', value: 100.0 },
          { field: 'price', operator: 'lte', value: 110.0 },
        ],
        LogicalOperator: 'AND',
      };
      const currentPrice = 105.0;

      // Act
      const payload = createAlertNotificationPayload(rangeAlert, currentPrice);

      // Assert
      expect(payload).toEqual({
        title: '売りアラート: NSDQ:AAPL',
        body: '現在価格 $105.00 が範囲 $100.00〜$110.00 内になりました',
        icon: '/icon-192x192.png',
        data: {
          alertId: 'alert-1',
          exchangeId: 'NASDAQ',
          tickerId: 'NSDQ:AAPL',
          mode: 'Sell',
          currentPrice: 105.0,
          targetPrice: 100.0,
          url: '/?exchangeId=NASDAQ&tickerId=NSDQ%3AAAPL',
        },
      });
    });

    it('範囲外アラート（OR）の通知ペイロードを生成する', () => {
      // Arrange
      const rangeAlert: Alert = {
        ...mockAlert,
        ConditionList: [
          { field: 'price', operator: 'lte', value: 90.0 },
          { field: 'price', operator: 'gte', value: 120.0 },
        ],
        LogicalOperator: 'OR',
      };
      const currentPrice = 85.0;

      // Act
      const payload = createAlertNotificationPayload(rangeAlert, currentPrice);

      // Assert
      expect(payload).toEqual({
        title: '売りアラート: NSDQ:AAPL',
        body: '現在価格 $85.00 が範囲外（$90.00 以下 または $120.00 以上）になりました',
        icon: '/icon-192x192.png',
        data: {
          alertId: 'alert-1',
          exchangeId: 'NASDAQ',
          tickerId: 'NSDQ:AAPL',
          mode: 'Sell',
          currentPrice: 85.0,
          targetPrice: 120.0,
          url: '/?exchangeId=NASDAQ&tickerId=NSDQ%3AAAPL',
        },
      });
    });

    it('複数条件で gte がない場合はエラーをスローする', () => {
      // Arrange
      const invalidAlert: Alert = {
        ...mockAlert,
        ConditionList: [
          { field: 'price', operator: 'lte', value: 100.0 },
          { field: 'price', operator: 'lte', value: 110.0 },
        ],
        LogicalOperator: 'AND',
      };
      const currentPrice = 105.0;

      // Act & Assert
      expect(() => createAlertNotificationPayload(invalidAlert, currentPrice)).toThrow(
        '複数条件のアラートには gte と lte が必要です'
      );
    });

    it('複数条件で lte がない場合はエラーをスローする', () => {
      // Arrange
      const invalidAlert: Alert = {
        ...mockAlert,
        ConditionList: [
          { field: 'price', operator: 'gte', value: 100.0 },
          { field: 'price', operator: 'gte', value: 110.0 },
        ],
        LogicalOperator: 'AND',
      };
      const currentPrice = 105.0;

      // Act & Assert
      expect(() => createAlertNotificationPayload(invalidAlert, currentPrice)).toThrow(
        '複数条件のアラートには gte と lte が必要です'
      );
    });

    it('LogicalOperator が undefined の場合、デフォルトで AND として扱う', () => {
      // Arrange
      const alertWithoutOperator: Alert = {
        ...mockAlert,
        ConditionList: [
          { field: 'price', operator: 'gte', value: 100.0 },
          { field: 'price', operator: 'lte', value: 110.0 },
        ],
        LogicalOperator: undefined,
      };
      const currentPrice = 105.0;

      // Act
      const payload = createAlertNotificationPayload(alertWithoutOperator, currentPrice);

      // Assert
      expect(payload).toEqual({
        title: '売りアラート: NSDQ:AAPL',
        body: '現在価格 $105.00 が範囲 $100.00〜$110.00 内になりました',
        icon: '/icon-192x192.png',
        data: {
          alertId: 'alert-1',
          exchangeId: 'NASDAQ',
          tickerId: 'NSDQ:AAPL',
          mode: 'Sell',
          currentPrice: 105.0,
          targetPrice: 100.0,
          url: '/?exchangeId=NASDAQ&tickerId=NSDQ%3AAAPL',
        },
      });
    });

    it('通知タイトルと通知本文が指定されている場合はカスタム値を使用する', () => {
      // Arrange
      const customAlert: Alert = {
        ...mockAlert,
        NotificationTitle: 'カスタムタイトル',
        NotificationBody: 'カスタム本文',
      };
      const currentPrice = 205.5;

      // Act
      const payload = createAlertNotificationPayload(customAlert, currentPrice);

      // Assert
      expect(payload.title).toBe('カスタムタイトル');
      expect(payload.body).toBe('カスタム本文');
    });

    it('通知タイトルと通知本文が空文字の場合は自動生成値を使用する', () => {
      // Arrange
      const customAlert: Alert = {
        ...mockAlert,
        NotificationTitle: '',
        NotificationBody: '',
      };
      const currentPrice = 205.5;

      // Act
      const payload = createAlertNotificationPayload(customAlert, currentPrice);

      // Assert
      expect(payload.title).toBe('売りアラート: NSDQ:AAPL');
      expect(payload.body).toBe('現在価格 $205.50 が目標価格 $200.00 以上になりました');
    });

    it('通知タイトルのみ指定されている場合は本文のみ自動生成値を使用する', () => {
      // Arrange
      const customAlert: Alert = {
        ...mockAlert,
        NotificationTitle: 'タイトルのみカスタム',
      };
      const currentPrice = 205.5;

      // Act
      const payload = createAlertNotificationPayload(customAlert, currentPrice);

      // Assert
      expect(payload.title).toBe('タイトルのみカスタム');
      expect(payload.body).toBe('現在価格 $205.50 が目標価格 $200.00 以上になりました');
    });

    it('通知本文のみ指定されている場合はタイトルのみ自動生成値を使用する', () => {
      // Arrange
      const customAlert: Alert = {
        ...mockAlert,
        NotificationBody: '本文のみカスタム',
      };
      const currentPrice = 205.5;

      // Act
      const payload = createAlertNotificationPayload(customAlert, currentPrice);

      // Assert
      expect(payload.title).toBe('売りアラート: NSDQ:AAPL');
      expect(payload.body).toBe('本文のみカスタム');
    });

    it('無効な LogicalOperator の場合はエラーをスローする', () => {
      // Arrange
      const invalidAlert: Alert = {
        ...mockAlert,
        ConditionList: [
          { field: 'price', operator: 'gte', value: 100.0 },
          { field: 'price', operator: 'lte', value: 110.0 },
        ],
        LogicalOperator: 'INVALID' as 'AND' | 'OR',
      };
      const currentPrice = 105.0;

      // Act & Assert
      expect(() => createAlertNotificationPayload(invalidAlert, currentPrice)).toThrow(
        '無効な LogicalOperator です'
      );
    });

    it('条件が0個の場合はエラーをスローする', () => {
      // Arrange
      const invalidAlert: Alert = {
        ...mockAlert,
        ConditionList: [],
      };
      const currentPrice = 105.0;

      // Act & Assert
      expect(() => createAlertNotificationPayload(invalidAlert, currentPrice)).toThrow(
        'サポートされていない条件数です'
      );
    });

    it('条件が3個以上の場合はエラーをスローする', () => {
      // Arrange
      const invalidAlert: Alert = {
        ...mockAlert,
        ConditionList: [
          { field: 'price', operator: 'gte', value: 100.0 },
          { field: 'price', operator: 'lte', value: 110.0 },
          { field: 'price', operator: 'gte', value: 120.0 },
        ],
        LogicalOperator: 'AND',
      };
      const currentPrice = 105.0;

      // Act & Assert
      expect(() => createAlertNotificationPayload(invalidAlert, currentPrice)).toThrow(
        'サポートされていない条件数です: 3'
      );
    });
  });

  describe('normalizeVapidKey', () => {
    it('前後の空白を除去する', () => {
      expect(normalizeVapidKey('  test-key  ', 'publicKey')).toBe('test-key');
    });

    it('引用符で囲まれた値を正規化する', () => {
      expect(normalizeVapidKey('"test-key"', 'publicKey')).toBe('test-key');
    });

    it('JSON文字列から指定キーを抽出する', () => {
      const raw = '{"publicKey":"public-value","privateKey":"private-value"}';
      expect(normalizeVapidKey(raw, 'publicKey')).toBe('public-value');
      expect(normalizeVapidKey(raw, 'privateKey')).toBe('private-value');
    });
  });
});
