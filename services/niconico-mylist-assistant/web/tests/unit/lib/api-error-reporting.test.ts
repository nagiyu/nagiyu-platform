/**
 * @jest-environment node
 */

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

import { NextRequest, NextResponse } from 'next/server';
import {
  createErrorEventWriter,
  reportErrorEvent,
  resetErrorEventWriter,
  type InMemoryErrorEventWriter,
} from '@nagiyu/aws';
import type { ErrorEvent } from '@nagiyu/common';
import {
  createWithApiErrorReportingBody,
  errorReporter,
  withApiErrorReporting,
} from '../../../src/lib/api-error-reporting';

const mockReportErrorEvent = reportErrorEvent as jest.MockedFunction<typeof reportErrorEvent>;

type RouteHandler = (request: NextRequest) => Promise<NextResponse>;

/** 常に指定のレスポンスを返すハンドラ */
const returning =
  (response: NextResponse): RouteHandler =>
  async () =>
    response;

/** 常に例外を投げるハンドラ */
const throwing =
  (error: Error): RouteHandler =>
  async () => {
    throw error;
  };

const makeRequest = () => new NextRequest('http://localhost/api/sample?secret=1');

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('withApiErrorReporting', () => {
  it('正常に返したレスポンスはそのまま返し、報告しない', async () => {
    const handler = withApiErrorReporting('テスト', returning(NextResponse.json({ ok: true })));

    const response = await handler(makeRequest());
    expect(response.status).toBe(200);
    expect(mockReportErrorEvent).not.toHaveBeenCalled();
  });

  it('ハンドラが自分で返した 500 は報告しない', async () => {
    const handler = withApiErrorReporting(
      'テスト',
      returning(NextResponse.json({ error: 'x' }, { status: 500 }))
    );

    const response = await handler(makeRequest());
    expect(response.status).toBe(500);
    expect(mockReportErrorEvent).not.toHaveBeenCalled();
  });

  it('想定外の例外は 500 に変換して serviceId 付きで報告する', async () => {
    const handler = withApiErrorReporting('Web API: テストエラー', throwing(new Error('想定外')));

    const response = await handler(makeRequest());
    expect(response.status).toBe(500);
    expect(mockReportErrorEvent).toHaveBeenCalledTimes(1);
    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'niconico-mylist-assistant',
        severity: 'error',
        title: 'Web API: テストエラー',
        message: '想定外',
        context: expect.objectContaining({ method: 'GET', pathname: '/api/sample' }),
      })
    );
  });
});

describe('createWithApiErrorReportingBody', () => {
  const BODY = { error: 'SAMPLE_ERROR', message: '失敗しました' };

  it('例外時はルートが指定した body を 500 で返し、ラベル付きでログと報告を行う', async () => {
    const error = new Error('内部エラー');
    const handler = createWithApiErrorReportingBody('サンプルエラー:', BODY)(
      'Web API: サンプルエラー',
      throwing(error)
    );

    const response = await handler(makeRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(BODY);
    expect(console.error).toHaveBeenCalledWith('サンプルエラー:', error);
    expect(mockReportErrorEvent).toHaveBeenCalledTimes(1);
    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Web API: サンプルエラー', message: '内部エラー' })
    );
  });

  it('toLogDetail を渡すとログにはその内容だけを出す', async () => {
    const handler = createWithApiErrorReportingBody(
      'サンプルエラー:',
      BODY,
      (error) => (error as Error).message
    )('Web API: サンプルエラー', throwing(new Error('内部エラー')));

    await handler(makeRequest());
    expect(console.error).toHaveBeenCalledWith('サンプルエラー:', '内部エラー');
  });

  it('正常に返したレスポンスは報告しない', async () => {
    const handler = createWithApiErrorReportingBody('サンプルエラー:', BODY)(
      'Web API: サンプルエラー',
      returning(NextResponse.json({ ok: true }))
    );

    const response = await handler(makeRequest());
    expect(response.status).toBe(200);
    expect(mockReportErrorEvent).not.toHaveBeenCalled();
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

  it('serviceId と title を詰め、context に例外の情報を載せて報告する', async () => {
    const error = new TypeError('保存失敗');

    await errorReporter.onError('Web API: Push 購読登録エラー')(error);

    const [event] = getRecords();
    expect(event).toMatchObject({
      serviceId: 'niconico-mylist-assistant',
      severity: 'error',
      title: 'Web API: Push 購読登録エラー',
      message: '保存失敗',
    });
    expect(JSON.parse(event.context)).toEqual({
      errorName: 'TypeError',
      errorMessage: '保存失敗',
      errorStack: error.stack,
    });
  });

  it('Error 以外の値でも報告できる', async () => {
    await errorReporter.onError('Web API: VAPID 公開鍵取得エラー')('文字列の例外');

    const [event] = getRecords();
    expect(event.message).toBe('文字列の例外');
    expect(JSON.parse(event.context)).toEqual({
      errorName: 'string',
      errorMessage: '文字列の例外',
    });
  });
});
