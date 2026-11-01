/**
 * @jest-environment node
 */
import { NextResponse } from 'next/server';
import {
  createErrorEventWriter,
  reportErrorEvent,
  resetErrorEventWriter,
  type InMemoryErrorEventWriter,
} from '@nagiyu/aws';
import type { ErrorEvent } from '@nagiyu/common';
import {
  DEFAULT_API_FAILURE_BODY,
  errorReporter,
  withApiErrorReporting,
} from '@/lib/server/api-error-reporting';

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

const mockReportErrorEvent = reportErrorEvent as jest.MockedFunction<typeof reportErrorEvent>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('withApiErrorReporting', () => {
  it('正常に返したレスポンスはそのまま返し、報告しない', async () => {
    const handler = withApiErrorReporting('Web API: テスト', async () =>
      NextResponse.json({ ok: true })
    );

    const res = await handler();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockReportErrorEvent).not.toHaveBeenCalled();
  });

  it('ハンドラが自分で返した 5xx は報告しない', async () => {
    const handler = withApiErrorReporting('Web API: テスト', async () =>
      NextResponse.json({ error: 'X' }, { status: 503 })
    );

    const res = await handler();

    expect(res.status).toBe(503);
    expect(mockReportErrorEvent).not.toHaveBeenCalled();
  });

  it('例外は指定した本文の 500 にして、livetalk として報告する', async () => {
    const handler = withApiErrorReporting(
      'Web API: テスト',
      async () => {
        throw new Error('boom');
      },
      { error: 'FETCH_FAILED', message: '取得に失敗しました' }
    );

    const res = await handler();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'FETCH_FAILED', message: '取得に失敗しました' });
    expect(mockReportErrorEvent).toHaveBeenCalledTimes(1);
    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'livetalk',
        severity: 'error',
        title: 'Web API: テスト',
        message: 'boom',
      })
    );
  });

  it('本文を省略した場合は認証ラッパーが返す本文と同じ形にする', async () => {
    const handler = withApiErrorReporting('Web API: テスト', async () => {
      throw new Error('boom');
    });

    const res = await handler();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual(DEFAULT_API_FAILURE_BODY);
  });

  it('例外の原因をサーバーログに残す', async () => {
    const error = new Error('boom');
    const handler = withApiErrorReporting('Web API: テスト', async () => {
      throw error;
    });

    await handler();

    expect(console.error).toHaveBeenCalledWith('[Web API: テスト]', error);
  });

  it('報告に失敗してもレスポンスを返す', async () => {
    mockReportErrorEvent.mockRejectedValueOnce(new Error('report failed'));
    const handler = withApiErrorReporting('Web API: テスト', async () => {
      throw new Error('boom');
    });

    const res = await handler();

    expect(res.status).toBe(500);
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

  it('livetalk として報告し、context に例外の情報と追加の context を載せる', async () => {
    const error = new TypeError('oops');

    await errorReporter.report('Web API: 握りつぶし', error, {
      context: { characterId: 'hiyori' },
      severity: 'warning',
    });

    const [event] = getRecords();
    expect(event).toMatchObject({
      serviceId: 'livetalk',
      severity: 'warning',
      title: 'Web API: 握りつぶし',
      message: 'oops',
    });
    expect(JSON.parse(event.context)).toEqual({
      characterId: 'hiyori',
      errorName: 'TypeError',
      errorMessage: 'oops',
      errorStack: error.stack,
    });
  });

  it('既定の重大度は error で、Error 以外の値も報告できる', async () => {
    await errorReporter.report('Web API: 握りつぶし', 'plain string');

    const [event] = getRecords();
    expect(event.severity).toBe('error');
    expect(JSON.parse(event.context)).toEqual({
      errorName: 'string',
      errorMessage: 'plain string',
    });
  });

  it('onError は渡したタイトルで報告する', async () => {
    await errorReporter.onError('Web API: Push テスト')(new Error('push failed'));

    expect(getRecords()).toEqual([
      expect.objectContaining({
        serviceId: 'livetalk',
        title: 'Web API: Push テスト',
        message: 'push failed',
      }),
    ]);
  });
});
