import { NextRequest } from 'next/server';
import { PUT } from '../../../../app/api/alerts/[id]/route';
import { createAlertRepository } from '../../../../lib/repository-factory';

jest.mock('../../../../lib/repository-factory', () => ({
  createAlertRepository: jest.fn(),
  createTickerRepository: jest.fn(),
  createExchangeRepository: jest.fn(),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/nextjs', () => ({
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { userId: 'test-user' } }, ...args);
  }),
  handleApiError: jest.fn((error) => {
    throw error;
  }),
}));

describe('PUT /api/alerts/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createAlertRepository as jest.Mock).mockReturnValue({
      getById: jest.fn().mockResolvedValue({
        AlertID: 'alert-1',
        UserID: 'test-user',
        TickerID: 'NASDAQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 100 }],
        NotificationTitle: '既存タイトル',
        NotificationBody: '既存本文',
        SubscriptionEndpoint: 'https://example.com/endpoint',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-key',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      }),
      update: jest.fn(),
    });
  });

  const createRequest = (body: Record<string, unknown>) =>
    new NextRequest('http://localhost/api/alerts/alert-1', {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });

  it('notificationTitle が空文字の場合は 400 を返す', async () => {
    const response = await PUT(createRequest({ notificationTitle: ' ' }), {
      params: Promise.resolve({ id: 'alert-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe('通知タイトルは必須です');
  });

  it('notificationBody が空文字の場合は 400 を返す', async () => {
    const response = await PUT(createRequest({ notificationBody: '' }), {
      params: Promise.resolve({ id: 'alert-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe('通知本文は必須です');
  });
});
