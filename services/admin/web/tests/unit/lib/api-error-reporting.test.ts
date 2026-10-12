/**
 * @jest-environment node
 */

import { NextResponse } from 'next/server';
import { withApiErrorReporting } from '../../../src/lib/api-error-reporting';

const mockReportErrorEvent = jest.fn();

jest.mock('@nagiyu/aws', () => ({
  reportErrorEvent: (...args: unknown[]) => mockReportErrorEvent(...args),
}));

const INTERNAL_ERROR_MESSAGE = 'テスト用の失敗メッセージ';

describe('withApiErrorReporting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReportErrorEvent.mockResolvedValue(null);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ハンドラが正常に返したレスポンスはそのまま返し、報告しない', async () => {
    const handler = withApiErrorReporting(
      'テスト',
      async () => NextResponse.json({ ok: true }, { status: 200 }),
      INTERNAL_ERROR_MESSAGE
    );

    const response = await handler();

    expect(response.status).toBe(200);
    expect(mockReportErrorEvent).not.toHaveBeenCalled();
  });

  it('ハンドラ自身が返した 4xx は報告しない', async () => {
    const handler = withApiErrorReporting(
      'テスト',
      async () => NextResponse.json({ error: '不正' }, { status: 400 }),
      INTERNAL_ERROR_MESSAGE
    );

    const response = await handler();

    expect(response.status).toBe(400);
    expect(mockReportErrorEvent).not.toHaveBeenCalled();
  });

  it('例外は serviceId admin で報告し、ルート固有の body で 500 を返す', async () => {
    const handler = withApiErrorReporting(
      'Web API: テストエラー',
      async () => {
        throw new Error('DB error');
      },
      INTERNAL_ERROR_MESSAGE
    );

    const response = await handler();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'INTERNAL_ERROR',
      message: INTERNAL_ERROR_MESSAGE,
    });
    expect(mockReportErrorEvent).toHaveBeenCalledTimes(1);
    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'admin',
        severity: 'error',
        title: 'Web API: テストエラー',
        message: 'DB error',
      })
    );
  });

  it('例外のログを console.error に残す', async () => {
    const handler = withApiErrorReporting(
      'Web API: テストエラー',
      async () => {
        throw new Error('DB error');
      },
      INTERNAL_ERROR_MESSAGE
    );

    await handler();

    expect(console.error).toHaveBeenCalledWith('Web API: テストエラー', {
      error: expect.any(Error),
    });
  });
});
