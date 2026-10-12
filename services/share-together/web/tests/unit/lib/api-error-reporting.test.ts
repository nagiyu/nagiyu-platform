/**
 * @jest-environment node
 */

jest.mock('@nagiyu/aws', () => ({
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

import { reportErrorEvent } from '@nagiyu/aws';
import {
  API_ERROR_REPORTING_MESSAGES,
  toInternalServerErrorResponse,
  withApiErrorReporting,
} from '@/lib/api-error-reporting';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

const mockReportErrorEvent = reportErrorEvent as jest.MockedFunction<typeof reportErrorEvent>;

describe('lib/api-error-reporting', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('toInternalServerErrorResponse', () => {
    it('既存の 500 形式のレスポンスを返し、ログを出す', async () => {
      const error = new Error('障害');

      const response = toInternalServerErrorResponse(error);

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: 'INTERNAL_SERVER_ERROR',
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(API_ERROR_REPORTING_MESSAGES.UNEXPECTED_ERROR, {
        error,
      });
    });
  });

  describe('withApiErrorReporting', () => {
    it('例外を 500 レスポンスに変換して報告する', async () => {
      const handler = withApiErrorReporting('Web API: テストエラー', async () => {
        throw new Error('障害');
      });

      const response = await handler();

      expect(response.status).toBe(500);
      expect(mockReportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'share-together',
          severity: 'error',
          title: 'Web API: テストエラー',
          message: '障害',
        })
      );
    });

    it('ハンドラが返したレスポンスは報告しない', async () => {
      const handler = withApiErrorReporting(
        'Web API: テストエラー',
        async () => new Response(null, { status: 404 })
      );

      const response = await handler();

      expect(response.status).toBe(404);
      expect(mockReportErrorEvent).not.toHaveBeenCalled();
    });
  });
});
