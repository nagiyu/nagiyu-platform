import { NextResponse } from 'next/server';
import {
  createErrorEventWriter,
  reportErrorEvent,
  resetErrorEventWriter,
  type InMemoryErrorEventWriter,
} from '@nagiyu/aws';
import type { ErrorEvent } from '@nagiyu/common';
import {
  createInternalErrorReporting,
  errorReporter,
  withApiErrorReporting,
} from '../../../lib/api-error-reporting';

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

const mockedReportErrorEvent = reportErrorEvent as jest.MockedFunction<typeof reportErrorEvent>;

describe('api-error-reporting', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('withApiErrorReporting', () => {
    it('正常なレスポンスはそのまま返し、報告しない', async () => {
      const handler = withApiErrorReporting('Web API: テスト', async () =>
        NextResponse.json({ ok: true }, { status: 200 })
      );

      const response = await handler();

      expect(response.status).toBe(200);
      expect(mockedReportErrorEvent).not.toHaveBeenCalled();
    });

    it('ハンドラ自身が返した 4xx / 5xx は報告しない', async () => {
      const handler = withApiErrorReporting('Web API: テスト', async () =>
        NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
      );

      const response = await handler();

      expect(response.status).toBe(500);
      expect(mockedReportErrorEvent).not.toHaveBeenCalled();
    });

    it('想定外の例外は handleApiError 形式の 500 にして、stock-tracker として報告する', async () => {
      const handler = withApiErrorReporting('Web API: テスト', async () => {
        throw new Error('db error');
      });

      const response = await handler();

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: 'INTERNAL_ERROR',
        message: '内部エラーが発生しました',
      });
      expect(mockedReportErrorEvent).toHaveBeenCalledTimes(1);
      expect(mockedReportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'stock-tracker',
          severity: 'error',
          title: 'Web API: テスト',
          message: 'db error',
        })
      );
    });

    it('404 に変換される例外は報告しない', async () => {
      class TickerNotFoundError extends Error {
        constructor() {
          super('ティッカーが見つかりません');
          this.name = 'TickerNotFoundError';
        }
      }
      const handler = withApiErrorReporting('Web API: テスト', async () => {
        throw new TickerNotFoundError();
      });

      const response = await handler();

      expect(response.status).toBe(404);
      expect(mockedReportErrorEvent).not.toHaveBeenCalled();
    });
  });

  describe('createInternalErrorReporting', () => {
    const MESSAGE = '取得に失敗しました';

    it('例外の種類によらず 500 と固定メッセージを返し、報告する', async () => {
      const handler = createInternalErrorReporting(MESSAGE)('Web API: テスト', async () => {
        throw new Error('db error');
      });

      const response = await handler();

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'INTERNAL_ERROR', message: MESSAGE });
      expect(mockedReportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'stock-tracker',
          title: 'Web API: テスト',
          message: 'db error',
        })
      );
    });

    it('NotFound 相当の名前の例外でも 500 のままにする', async () => {
      class TickerNotFoundError extends Error {
        constructor() {
          super('not found');
          this.name = 'TickerNotFoundError';
        }
      }
      const handler = createInternalErrorReporting(MESSAGE)('Web API: テスト', async () => {
        throw new TickerNotFoundError();
      });

      const response = await handler();

      expect(response.status).toBe(500);
      expect(mockedReportErrorEvent).toHaveBeenCalledTimes(1);
    });

    it('例外を既定のラベルでログに残す', async () => {
      const error = new Error('db error');
      const handler = createInternalErrorReporting(MESSAGE)('Web API: テスト', async () => {
        throw error;
      });

      await handler();

      expect(consoleErrorSpy).toHaveBeenCalledWith('API Error:', error);
    });

    it('指定したラベルでログに残す', async () => {
      const error = new Error('db error');
      const handler = createInternalErrorReporting(MESSAGE, 'Error in test API:')(
        'Web API: テスト',
        async () => {
          throw error;
        }
      );

      await handler();

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error in test API:', error);
    });

    it('正常なレスポンスはそのまま返し、報告しない', async () => {
      const handler = createInternalErrorReporting(MESSAGE)('Web API: テスト', async () =>
        NextResponse.json({ ok: true }, { status: 200 })
      );

      const response = await handler();

      expect(response.status).toBe(200);
      expect(mockedReportErrorEvent).not.toHaveBeenCalled();
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

    it('stock-tracker として報告し、context に例外の情報と追加の context を載せる', async () => {
      const error = new TypeError('bad value');

      await errorReporter.report('Web API: テスト', error, { context: { tickerId: 'NSDQ:AAPL' } });

      const [event] = getRecords();
      expect(event).toMatchObject({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'Web API: テスト',
        message: 'bad value',
      });
      expect(JSON.parse(event.context)).toEqual({
        tickerId: 'NSDQ:AAPL',
        errorName: 'TypeError',
        errorMessage: 'bad value',
        errorStack: error.stack,
      });
    });

    it('onError は渡したタイトルで報告する', async () => {
      await errorReporter.onError('Web API: テスト')(new Error('route failed'));

      expect(getRecords()).toEqual([
        expect.objectContaining({
          serviceId: 'stock-tracker',
          title: 'Web API: テスト',
          message: 'route failed',
        }),
      ]);
    });
  });
});
