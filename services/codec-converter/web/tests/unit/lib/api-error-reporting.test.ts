/**
 * @jest-environment node
 */

import { NextResponse } from 'next/server';
import {
  createErrorEventWriter,
  resetErrorEventWriter,
  type InMemoryErrorEventWriter,
} from '@nagiyu/aws';
import type { ErrorEvent } from '@nagiyu/common';
import { errorReporter, withApiErrorReporting } from '../../../src/lib/api-error-reporting';

const mockReportErrorEvent = jest.fn();

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
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

  it('例外は serviceId codec-converter で報告し、ルート固有の body で 500 を返す', async () => {
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
      error: 'INTERNAL_SERVER_ERROR',
      message: INTERNAL_ERROR_MESSAGE,
    });
    expect(mockReportErrorEvent).toHaveBeenCalledTimes(1);
    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'codec-converter',
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

    expect(console.error).toHaveBeenCalledWith('Web API: テストエラー', expect.any(Error));
  });
});

describe('errorReporter', () => {
  const TABLE_NAME = 'test-error-events';

  beforeEach(() => {
    process.env.USE_IN_MEMORY_DB = 'true';
    process.env.ERROR_EVENTS_TABLE_NAME = TABLE_NAME;
    resetErrorEventWriter();
  });

  afterEach(() => {
    delete process.env.USE_IN_MEMORY_DB;
    delete process.env.ERROR_EVENTS_TABLE_NAME;
    resetErrorEventWriter();
  });

  function getRecords(): readonly ErrorEvent[] {
    return (createErrorEventWriter() as InMemoryErrorEventWriter).getRecords();
  }

  it('codec-converter として報告し、context に例外の情報と追加の context を載せる', async () => {
    const error = new TypeError('bad value');

    await errorReporter.report('Web API: テスト', error, { context: { step: 'sample' } });

    const [event] = getRecords();
    expect(event).toMatchObject({
      serviceId: 'codec-converter',
      severity: 'error',
      title: 'Web API: テスト',
      message: 'bad value',
    });
    expect(JSON.parse(event.context)).toEqual({
      step: 'sample',
      errorName: 'TypeError',
      errorMessage: 'bad value',
      errorStack: error.stack,
    });
  });

  it('message と severity を上書きできる', async () => {
    await errorReporter.report('Web API: テスト', new Error('raw'), {
      message: '固定の文言',
      severity: 'warning',
    });

    expect(getRecords()).toEqual([
      expect.objectContaining({ severity: 'warning', message: '固定の文言' }),
    ]);
  });
});
