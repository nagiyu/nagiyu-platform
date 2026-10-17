import { NextRequest } from 'next/server';
import * as awsModule from '@nagiyu/aws';
import { POST } from '../../../../app/api/push/refresh/route';
import { createAlertRepository } from '../../../../lib/repository-factory';
import { getSession } from '../../../../lib/auth';
import { MALFORMED_BODY_CASES } from './invalidBodyCases';

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../../lib/repository-factory', () => ({
  createAlertRepository: jest.fn(),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

describe('POST /api/push/refresh', () => {
  const mockGetByUserId = jest.fn();
  const mockUpdate = jest.fn();
  let consoleErrorSpy: jest.SpyInstance;

  const newSubscription = {
    endpoint: 'https://example.com/new-endpoint',
    keys: { p256dh: 'new-p256dh', auth: 'new-auth' },
  };

  const createRequest = (rawBody: string) =>
    new NextRequest('http://localhost/api/push/refresh', {
      method: 'POST',
      body: rawBody,
      headers: { 'content-type': 'application/json' },
    });

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (getSession as jest.Mock).mockResolvedValue({
      user: { id: 'test-user', roles: ['stock-user'] },
    });
    (createAlertRepository as jest.Mock).mockReturnValue({
      getByUserId: mockGetByUserId,
      update: mockUpdate,
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('サブスクリプションが異なるアラートだけを更新する', async () => {
    mockGetByUserId.mockResolvedValue({
      items: [
        {
          alertId: 'a1',
          subscription: { endpoint: 'https://example.com/old', keys: newSubscription.keys },
        },
        { alertId: 'a2', subscription: newSubscription },
      ],
    });

    const response = await POST(createRequest(JSON.stringify({ subscription: newSubscription })));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, updatedCount: 1 });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('test-user', 'a1', { subscription: newSubscription });
  });

  it.each(MALFORMED_BODY_CASES)(
    '異常系: %s の場合は 400 を返し、下流を呼ばない',
    async (_label, rawBody) => {
      const response = await POST(createRequest(rawBody));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toEqual({ error: 'INVALID_REQUEST', message: 'リクエストボディが不正です' });
      expect(createAlertRepository).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    }
  );

  it('想定外のエラーは 500 を返して報告する', async () => {
    mockGetByUserId.mockRejectedValue(new Error('db error'));

    const response = await POST(createRequest(JSON.stringify({ subscription: newSubscription })));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'INTERNAL_ERROR',
      message: 'サブスクリプションの更新に失敗しました',
    });
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'Web API: サブスクリプション更新エラー',
        message: 'db error',
      })
    );
  });

  it('subscription がない場合は 400 を返す', async () => {
    const response = await POST(createRequest('{}'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe('サブスクリプション情報が必要です');
    expect(createAlertRepository).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null],
    ['文字列', 'subscription'],
    ['endpoint が URL 形式でない', { endpoint: 'not-a-url', keys: { p256dh: 'a', auth: 'b' } }],
    ['endpoint が数値', { endpoint: 1, keys: { p256dh: 'a', auth: 'b' } }],
    ['keys が欠落', { endpoint: 'https://example.com/e' }],
  ])(
    'subscription が不正（%s）な場合は 400 を返し、下流を呼ばない',
    async (_label, subscription) => {
      const response = await POST(createRequest(JSON.stringify({ subscription })));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.message).toBe('サブスクリプション情報が不正です');
      expect(createAlertRepository).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    }
  );
});
