/**
 * @jest-environment node
 */

import {
  createErrorEventWriter,
  reportErrorEvent,
  resetErrorEventWriter,
  type InMemoryErrorEventWriter,
} from '@nagiyu/aws';
import type { ErrorEvent } from '@nagiyu/common';
import { errorReporter, withApiErrorReporting } from '@/lib/api-error-reporting';

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
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

  it('quick-clip として報告し、context に例外の情報と追加の context を載せる', async () => {
    const error = new TypeError('bad value');

    await errorReporter.report('Web API: テスト', error, { context: { step: 'sample' } });

    const [event] = getRecords();
    expect(event).toMatchObject({
      serviceId: 'quick-clip',
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
