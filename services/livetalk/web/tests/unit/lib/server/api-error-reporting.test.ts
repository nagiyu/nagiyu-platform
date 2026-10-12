/**
 * @jest-environment node
 */
import { NextResponse } from 'next/server';
import { reportErrorEvent } from '@nagiyu/aws';
import {
  createPushRouteErrorReporter,
  DEFAULT_API_FAILURE_BODY,
  reportSwallowedError,
  withApiErrorReporting,
} from '@/lib/server/api-error-reporting';

jest.mock('@nagiyu/aws', () => ({
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

describe('reportSwallowedError', () => {
  it('例外の内容と文脈を指定の重大度で報告する', async () => {
    await reportSwallowedError(
      'Web API: 握りつぶし',
      new Error('oops'),
      { characterId: 'hiyori' },
      'warning'
    );

    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'livetalk',
        severity: 'warning',
        title: 'Web API: 握りつぶし',
        message: 'oops',
        context: expect.objectContaining({
          characterId: 'hiyori',
          errorName: 'Error',
          errorMessage: 'oops',
        }),
      })
    );
  });

  it('既定の重大度は error で、Error 以外の値も報告できる', async () => {
    await reportSwallowedError('Web API: 握りつぶし', 'plain string');

    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        context: expect.objectContaining({ errorName: 'string', errorStack: undefined }),
      })
    );
  });

  it('報告に失敗しても例外を投げない', async () => {
    mockReportErrorEvent.mockRejectedValueOnce(new Error('report failed'));

    await expect(
      reportSwallowedError('Web API: 握りつぶし', new Error('oops'))
    ).resolves.toBeUndefined();
  });
});

describe('createPushRouteErrorReporter', () => {
  it('指定した title で報告する関数を返す', async () => {
    await createPushRouteErrorReporter('Web API: Push テスト')(new Error('push failed'));

    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'livetalk',
        title: 'Web API: Push テスト',
        message: 'push failed',
      })
    );
  });
});
