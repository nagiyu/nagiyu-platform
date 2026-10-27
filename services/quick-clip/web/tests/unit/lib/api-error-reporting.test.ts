/**
 * @jest-environment node
 */

import { reportErrorEvent } from '@nagiyu/aws';
import { SERVICE_ID, withApiErrorReporting } from '@/lib/api-error-reporting';

jest.mock('@nagiyu/aws', () => ({
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

describe('withApiErrorReporting', () => {
  const INTERNAL_MESSAGE = 'テスト処理に失敗しました';
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('serviceId は quick-clip', () => {
    expect(SERVICE_ID).toBe('quick-clip');
  });

  it('正常に返したレスポンスはそのまま返し、報告しない', async () => {
    const handler = withApiErrorReporting(
      'Web API: テストエラー',
      INTERNAL_MESSAGE,
      async () => new Response('ok', { status: 200 })
    );

    const response = await handler();

    expect(response.status).toBe(200);
    expect(reportErrorEvent).not.toHaveBeenCalled();
  });

  it('ハンドラが自分で返した 5xx は報告しない', async () => {
    const handler = withApiErrorReporting(
      'Web API: テストエラー',
      INTERNAL_MESSAGE,
      async () => new Response('ng', { status: 500 })
    );

    const response = await handler();

    expect(response.status).toBe(500);
    expect(reportErrorEvent).not.toHaveBeenCalled();
  });

  it('例外は既存と同じ形の 500 に変換し、ログを出して報告する', async () => {
    const error = new Error('boom');
    const handler = withApiErrorReporting('Web API: テストエラー', INTERNAL_MESSAGE, async () => {
      throw error;
    });

    const response = await handler();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: INTERNAL_MESSAGE,
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('[Web API: テストエラー]', error);
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'quick-clip',
        severity: 'error',
        title: 'Web API: テストエラー',
        message: 'boom',
      })
    );
  });

  it('引数をそのままハンドラへ渡す', async () => {
    const handler = withApiErrorReporting(
      'Web API: テストエラー',
      INTERNAL_MESSAGE,
      async (a: string, b: number) => new Response(`${a}-${b}`)
    );

    const response = await handler('x', 1);

    expect(await response.text()).toBe('x-1');
  });
});
