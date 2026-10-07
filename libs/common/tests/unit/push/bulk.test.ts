import { sendWebPushNotification } from '../../../src/push/client.js';
import { sendWebPushNotifications } from '../../../src/push/bulk.js';
import type {
  NotificationPayload,
  PushSubscription,
  VapidConfig,
} from '../../../src/push/types.js';

jest.mock('../../../src/push/client.js', () => ({
  sendWebPushNotification: jest.fn(),
}));

const mockSend = sendWebPushNotification as jest.MockedFunction<typeof sendWebPushNotification>;

describe('sendWebPushNotifications', () => {
  const payload: NotificationPayload = { title: 't', body: 'b' };
  const vapidConfig: VapidConfig = {
    publicKey: 'pub',
    privateKey: 'priv',
    subject: 'mailto:a@b.c',
  };
  const toSubscription = (id: string): PushSubscription => ({
    endpoint: `https://example.com/${id}`,
    keys: { p256dh: `p-${id}`, auth: `a-${id}` },
  });

  beforeEach(() => {
    mockSend.mockReset();
  });

  test('対象が空なら送信せず空の結果を返す', async () => {
    const result = await sendWebPushNotifications([], toSubscription, payload, vapidConfig);

    expect(result).toEqual({ sent: [], invalid: [], failed: [] });
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('成功・無効・例外を振り分け、例外後も送信を続ける', async () => {
    const error = new Error('boom');
    mockSend
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(true);

    const result = await sendWebPushNotifications(
      ['a', 'b', 'c', 'd'],
      toSubscription,
      payload,
      vapidConfig
    );

    expect(result).toEqual({
      sent: ['a', 'd'],
      invalid: ['b'],
      failed: [{ target: 'c', error }],
    });
    expect(mockSend).toHaveBeenCalledTimes(4);
    expect(mockSend).toHaveBeenNthCalledWith(1, toSubscription('a'), payload, vapidConfig);
  });

  test('送信は逐次で行われる', async () => {
    let running = 0;
    let maxRunning = 0;
    mockSend.mockImplementation(async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await Promise.resolve();
      running -= 1;
      return true;
    });

    await sendWebPushNotifications(['a', 'b', 'c'], toSubscription, payload, vapidConfig);

    expect(maxRunning).toBe(1);
  });
});
