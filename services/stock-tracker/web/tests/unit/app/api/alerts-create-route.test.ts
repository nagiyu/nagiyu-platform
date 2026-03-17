import { NextRequest } from 'next/server';
import { POST } from '../../../../app/api/alerts/route';

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
  parsePagination: jest.fn(),
  handleApiError: jest.fn((error) => {
    throw error;
  }),
}));

describe('POST /api/alerts', () => {
  const createRequest = (body: Record<string, unknown>) =>
    new NextRequest('http://localhost/api/alerts', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });

  const validRequestBody = {
    tickerId: 'NASDAQ:AAPL',
    mode: 'Buy',
    frequency: 'MINUTE_LEVEL',
    conditions: [{ field: 'price', operator: 'gte', value: 100 }],
    notificationTitle: '通知タイトル',
    notificationBody: '通知本文',
    subscription: {
      endpoint: 'https://example.com/endpoint',
      keys: {
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      },
    },
  };

  it('notificationTitle が空文字の場合は 400 を返す', async () => {
    const response = await POST(createRequest({ ...validRequestBody, notificationTitle: '   ' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe('通知タイトルは必須です');
  });

  it('notificationBody が空文字の場合は 400 を返す', async () => {
    const response = await POST(createRequest({ ...validRequestBody, notificationBody: '' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe('通知本文は必須です');
  });
});
