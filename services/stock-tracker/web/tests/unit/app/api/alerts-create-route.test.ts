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
  validatePushSubscription: jest.requireActual('@nagiyu/nextjs').validatePushSubscription,
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { userId: 'test-user' } }, ...args);
  }),
  parsePagination: jest.fn(),
  handleApiError: jest.fn((error) => {
    throw error;
  }),
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
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
    subscription: {
      endpoint: 'https://example.com/endpoint',
      keys: {
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      },
    },
  };

  it('subscription が未指定の場合は 400 を返す', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { subscription: _sub, ...bodyWithoutSubscription } = validRequestBody;
    const response = await POST(createRequest(bodyWithoutSubscription));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe('Web Push サブスクリプション情報が必要です');
  });

  it.each([
    ['endpoint が URL 形式でない', { endpoint: 'not-a-url', keys: { p256dh: 'a', auth: 'b' } }],
    ['p256dh が空', { endpoint: 'https://example.com/e', keys: { p256dh: '', auth: 'b' } }],
    ['auth が欠落', { endpoint: 'https://example.com/e', keys: { p256dh: 'a' } }],
  ])('subscription が不正（%s）な場合は 400 を返す', async (_label, subscription) => {
    const response = await POST(createRequest({ ...validRequestBody, subscription }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_REQUEST');
    expect(body.message).toBe('Web Push サブスクリプション情報が必要です');
  });
});
