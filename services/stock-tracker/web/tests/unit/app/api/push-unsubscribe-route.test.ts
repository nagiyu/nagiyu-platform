import { NextRequest } from 'next/server';
import * as awsModule from '@nagiyu/aws';
import { DELETE } from '../../../../app/api/push/unsubscribe/route';
import { getSession } from '../../../../lib/auth';
import { MALFORMED_BODY_CASES } from './invalidBodyCases';

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

describe('DELETE /api/push/unsubscribe', () => {
  let consoleErrorSpy: jest.SpyInstance;

  const createRequest = (rawBody: string) =>
    new NextRequest('http://localhost/api/push/unsubscribe', {
      method: 'DELETE',
      body: rawBody,
      headers: { 'content-type': 'application/json' },
    });

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (getSession as jest.Mock).mockResolvedValue({
      user: { id: 'test-user', roles: ['stock-user'] },
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('正しい endpoint なら成功を返す', async () => {
    const response = await DELETE(
      createRequest(JSON.stringify({ endpoint: 'https://example.com/endpoint' }))
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it.each(MALFORMED_BODY_CASES)(
    '異常系: %s の場合は 400 を返し、通報もしない',
    async (_label, rawBody) => {
      const response = await DELETE(createRequest(rawBody));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toEqual({ error: 'INVALID_REQUEST', message: 'リクエストボディが不正です' });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    }
  );

  it('想定外のエラーは 500 を返して報告する', async () => {
    (getSession as jest.Mock).mockRejectedValue(new Error('session error'));

    const response = await DELETE(
      createRequest(JSON.stringify({ endpoint: 'https://example.com/endpoint' }))
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'INTERNAL_ERROR',
      message: 'サブスクリプションの解除に失敗しました',
    });
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'Web API: サブスクリプション解除エラー',
        message: 'session error',
      })
    );
  });

  it('endpoint がない場合は 400 を返す', async () => {
    const response = await DELETE(createRequest('{}'));

    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe('エンドポイント情報が必要です');
  });

  it.each([
    ['null', null],
    ['数値', 1],
    ['配列', ['https://example.com/endpoint']],
    ['空文字', ''],
    ['URL 形式でない', 'not-a-url'],
  ])('endpoint が不正（%s）な場合は 400 を返す', async (_label, endpoint) => {
    const response = await DELETE(createRequest(JSON.stringify({ endpoint })));

    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe('エンドポイント情報が不正です');
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
