import { NextRequest } from 'next/server';
import { EntityNotFoundError } from '@nagiyu/aws';
import { DELETE, PUT } from '../../../../app/api/alerts/[id]/route';
import { createAlertRepository, createTickerRepository } from '@nagiyu/stock-tracker-core';

jest.mock('@nagiyu/stock-tracker-core', () => ({
  ...jest.requireActual('@nagiyu/stock-tracker-core'),
  createAlertRepository: jest.fn(),
  createTickerRepository: jest.fn(),
  createExchangeRepository: jest.fn(),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/nextjs', () => ({
  createApiErrorReporting: jest.requireActual('@nagiyu/nextjs').createApiErrorReporting,
  readJsonObjectBody: jest.requireActual('@nagiyu/nextjs').readJsonObjectBody,
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { id: 'test-user' } }, ...args);
  }),
}));

describe('PUT /api/alerts/[id]', () => {
  const mockAlert = {
    alertId: '550e8400-e29b-41d4-a716-446655440000',
    userId: 'test-user',
    tickerId: 'NASDAQ:AAPL',
    exchangeId: 'NASDAQ',
    mode: 'Buy',
    frequency: 'MINUTE_LEVEL',
    enabled: true,
    conditionList: [{ field: 'price', operator: 'lte', value: 100 }],
    subscription: {
      endpoint: 'https://example.com/endpoint',
      keys: {
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      },
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createAlertRepository as jest.Mock).mockReturnValue({
      getById: jest.fn().mockResolvedValue(mockAlert),
      update: jest.fn().mockResolvedValue({ ...mockAlert }),
    });
    (createTickerRepository as jest.Mock).mockReturnValue({
      getById: jest.fn().mockResolvedValue({ symbol: 'AAPL', name: 'Apple Inc.' }),
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
      update: jest.fn().mockResolvedValue({ ...mockAlert, customMessage: '戦略メモ' }),
    });

    const response = await PUT(createRequest({ customMessage: '戦略メモ' }), {
      params: Promise.resolve({ id: 'alert-1' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.customMessage).toBe('戦略メモ');
  });

  describe('更新内容の組み立て', () => {
    const mockUpdate = jest.fn();

    beforeEach(() => {
      mockUpdate.mockReset();
      mockUpdate.mockResolvedValue({ ...mockAlert });
      (createAlertRepository as jest.Mock).mockReturnValue({
        getById: jest.fn().mockResolvedValue({
          ...mockAlert,
          customMessage: '古いメモ',
          temporary: true,
          temporaryExpireDate: '2024-01-02',
        }),
        update: mockUpdate,
      });
    });

    it('customMessage が空文字のときは、消す意図として null を渡す', async () => {
      const response = await PUT(createRequest({ customMessage: '   ' }), {
        params: Promise.resolve({ id: 'alert-1' }),
      });

      expect(response.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith('test-user', 'alert-1', { customMessage: null });
    });

    it('temporary を false にするときは、期限も消すために temporaryExpireDate に null を渡す', async () => {
      const response = await PUT(createRequest({ temporary: false }), {
        params: Promise.resolve({ id: 'alert-1' }),
      });

      expect(response.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith('test-user', 'alert-1', {
        temporary: false,
        temporaryExpireDate: null,
      });
    });
  });

  it('更新時に対象が見つからなかった場合 (取得後に削除された) は 404 を返す', async () => {
    (createAlertRepository as jest.Mock).mockReturnValue({
      getById: jest.fn().mockResolvedValue(mockAlert),
      update: jest.fn().mockRejectedValue(new EntityNotFoundError('Alert', 'test-user#alert-1')),
    });

    const response = await PUT(createRequest({ enabled: false }), {
      params: Promise.resolve({ id: 'alert-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'NOT_FOUND', message: '指定されたアラートが見つかりません' });
  });

  it('更新対象を事前に取得できない場合は 404 を返し、更新しない', async () => {
    const update = jest.fn();
    (createAlertRepository as jest.Mock).mockReturnValue({
      getById: jest.fn().mockResolvedValue(null),
      update,
    });

    const response = await PUT(createRequest({ enabled: false }), {
      params: Promise.resolve({ id: 'alert-1' }),
    });

    expect(response.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/alerts/[id]', () => {
  const mockDelete = jest.fn();

  const createRequest = () =>
    new NextRequest('http://localhost/api/alerts/alert-1', { method: 'DELETE' });

  beforeEach(() => {
    jest.clearAllMocks();
    (createAlertRepository as jest.Mock).mockReturnValue({ delete: mockDelete });
  });

  it('アラートを削除し、削除した ID を返す', async () => {
    mockDelete.mockResolvedValue(undefined);

    const response = await DELETE(createRequest(), {
      params: Promise.resolve({ id: 'alert-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, deletedAlertId: 'alert-1' });
    expect(mockDelete).toHaveBeenCalledWith('test-user', 'alert-1');
  });

  it('対象のアラートが存在しない場合は 404 を返す', async () => {
    mockDelete.mockRejectedValue(new EntityNotFoundError('Alert', 'test-user#alert-1'));

    const response = await DELETE(createRequest(), {
      params: Promise.resolve({ id: 'alert-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'NOT_FOUND', message: '指定されたアラートが見つかりません' });
  });
});
