import { NextRequest } from 'next/server';
import { DELETE } from '../../../../app/api/push/unsubscribe/route';
import { getSession } from '../../../../lib/auth';
import { MALFORMED_BODY_CASES } from './invalidBodyCases';

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
