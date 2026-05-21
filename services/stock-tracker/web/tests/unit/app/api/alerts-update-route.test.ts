import { NextRequest } from 'next/server';
import { PUT } from '../../../../app/api/alerts/[id]/route';
import { createAlertRepository, createTickerRepository } from '../../../../lib/repository-factory';

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
  const mockAlert = {
    AlertID: 'alert-1',
    UserID: 'test-user',
    TickerID: 'NASDAQ:AAPL',
    ExchangeID: 'NASDAQ',
    Mode: 'Buy',
    Frequency: 'MINUTE_LEVEL',
    Enabled: true,
    ConditionList: [{ field: 'price', operator: 'lte', value: 100 }],
    subscription: {
      endpoint: 'https://example.com/endpoint',
      keys: {
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      },
    },
    CreatedAt: Date.now(),
    UpdatedAt: Date.now(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createAlertRepository as jest.Mock).mockReturnValue({
      getById: jest.fn().mockResolvedValue(mockAlert),
      update: jest.fn().mockResolvedValue({ ...mockAlert }),
    });
    (createTickerRepository as jest.Mock).mockReturnValue({
      getById: jest.fn().mockResolvedValue({ Symbol: 'AAPL', Name: 'Apple Inc.' }),
    });
  });

  const createRequest = (body: Record<string, unknown>) =>
    new NextRequest('http://localhost/api/alerts/alert-1', {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });

  it('更新フィールドが空の場合は 400 を返す', async () => {
    const response = await PUT(createRequest({}), {
      params: Promise.resolve({ id: 'alert-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe('更新する内容を指定してください');
  });

  it('customMessage を更新できる', async () => {
    (createAlertRepository as jest.Mock).mockReturnValue({
      getById: jest.fn().mockResolvedValue(mockAlert),
      update: jest.fn().mockResolvedValue({ ...mockAlert, CustomMessage: '戦略メモ' }),
    });

    const response = await PUT(createRequest({ customMessage: '戦略メモ' }), {
      params: Promise.resolve({ id: 'alert-1' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.customMessage).toBe('戦略メモ');
  });
});
