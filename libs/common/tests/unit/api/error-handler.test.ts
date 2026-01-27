/**
 * Unit tests for error handling utilities
 */

import {
  getErrorTypeFromStatus,
  parseErrorResponse,
  handleFetchError,
  mapAPIErrorToMessage,
  isRetryableError,
  extractErrorInfo,
} from '../../../src/api/error-handler';
import { COMMON_ERROR_MESSAGES } from '../../../src/api/types';
import type { APIErrorResponse } from '../../../src/api/types';

describe('error-handler', () => {
  describe('getErrorTypeFromStatus', () => {
    it('should return "error" for 5xx status codes', () => {
      expect(getErrorTypeFromStatus(500)).toBe('error');
      expect(getErrorTypeFromStatus(502)).toBe('error');
      expect(getErrorTypeFromStatus(503)).toBe('error');
    });

    it('should return "warning" for 4xx status codes', () => {
      expect(getErrorTypeFromStatus(400)).toBe('warning');
      expect(getErrorTypeFromStatus(401)).toBe('warning');
      expect(getErrorTypeFromStatus(403)).toBe('warning');
      expect(getErrorTypeFromStatus(404)).toBe('warning');
      expect(getErrorTypeFromStatus(429)).toBe('warning');
    });

    it('should return "info" for other status codes', () => {
      expect(getErrorTypeFromStatus(200)).toBe('info');
      expect(getErrorTypeFromStatus(300)).toBe('info');
      expect(getErrorTypeFromStatus(301)).toBe('info');
    });
  });

  describe('parseErrorResponse', () => {
    it('should parse valid JSON error response', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          error: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: ['Field is required'],
        }),
        status: 400,
      } as unknown as Response;

      const result = await parseErrorResponse(mockResponse);

      expect(result).toEqual({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: ['Field is required'],
      });
    });

    it('should handle invalid JSON response', async () => {
      const mockResponse = {
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
        status: 500,
      } as unknown as Response;

      const result = await parseErrorResponse(mockResponse);

      expect(result).toEqual({
        error: 'HTTP_ERROR',
        message: 'HTTPエラー: 500',
      });
    });

    it('should handle response without error field', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          message: 'Some message',
        }),
        status: 400,
      } as unknown as Response;

      const result = await parseErrorResponse(mockResponse);

      expect(result).toEqual({
        error: 'HTTP_ERROR',
        message: 'HTTPエラー: 400',
      });
    });
  });

  describe('handleFetchError', () => {
    it('should handle network error', () => {
      const error = new TypeError('Failed to fetch');
      const result = handleFetchError(error);

      expect(result).toEqual({
        type: 'error',
        message: COMMON_ERROR_MESSAGES.NETWORK_ERROR,
        shouldRetry: true,
      });
    });

    it('should handle timeout error', () => {
      const error = new Error('Timeout');
      error.name = 'AbortError';
      const result = handleFetchError(error);

      expect(result).toEqual({
        type: 'error',
        message: COMMON_ERROR_MESSAGES.TIMEOUT_ERROR,
        shouldRetry: true,
      });
    });

    it('should handle unknown error', () => {
      const error = new Error('Unknown error');
      const result = handleFetchError(error);

      expect(result).toEqual({
        type: 'error',
        message: COMMON_ERROR_MESSAGES.UNKNOWN_ERROR,
        shouldRetry: false,
      });
    });
  });

  describe('mapAPIErrorToMessage', () => {
    it('should use service-specific message first', () => {
      const errorResponse: APIErrorResponse = {
        error: 'CUSTOM_ERROR',
        message: 'Original message',
      };

      const serviceMessages = {
        CUSTOM_ERROR: 'カスタムエラーメッセージ',
      };

      const result = mapAPIErrorToMessage(errorResponse, serviceMessages);
      expect(result).toBe('カスタムエラーメッセージ');
    });

    it('should fallback to common message if service message not found', () => {
      const errorResponse: APIErrorResponse = {
        error: 'UNAUTHORIZED',
        message: 'Original message',
      };

      const result = mapAPIErrorToMessage(errorResponse);
      expect(result).toBe(COMMON_ERROR_MESSAGES.UNAUTHORIZED);
    });

    it('should use API response message if no mapping found', () => {
      const errorResponse: APIErrorResponse = {
        error: 'UNKNOWN_CODE',
        message: 'API response message',
      };

      const result = mapAPIErrorToMessage(errorResponse);
      expect(result).toBe('API response message');
    });

    it('should use UNKNOWN_ERROR if no message available', () => {
      const errorResponse: APIErrorResponse = {
        error: 'UNKNOWN_CODE',
        message: '',
      };

      const result = mapAPIErrorToMessage(errorResponse);
      expect(result).toBe(COMMON_ERROR_MESSAGES.UNKNOWN_ERROR);
    });

    it('should map common error codes correctly', () => {
      const testCases: Array<[string, string]> = [
        ['UNAUTHORIZED', COMMON_ERROR_MESSAGES.UNAUTHORIZED],
        ['FORBIDDEN', COMMON_ERROR_MESSAGES.FORBIDDEN],
        ['INVALID_REQUEST', COMMON_ERROR_MESSAGES.INVALID_REQUEST],
        ['VALIDATION_ERROR', COMMON_ERROR_MESSAGES.VALIDATION_ERROR],
        ['NOT_FOUND', COMMON_ERROR_MESSAGES.NOT_FOUND],
        ['INTERNAL_ERROR', COMMON_ERROR_MESSAGES.SERVER_ERROR],
      ];

      testCases.forEach(([errorCode, expectedMessage]) => {
        const errorResponse: APIErrorResponse = {
          error: errorCode,
          message: 'Original message',
        };
        expect(mapAPIErrorToMessage(errorResponse)).toBe(expectedMessage);
      });
    });

    it('should prioritize service message over common message', () => {
      const errorResponse: APIErrorResponse = {
        error: 'UNAUTHORIZED',
        message: 'Original message',
      };

      const serviceMessages = {
        UNAUTHORIZED: 'サービス固有の認証エラー',
      };

      const result = mapAPIErrorToMessage(errorResponse, serviceMessages);
      expect(result).toBe('サービス固有の認証エラー');
    });
  });

  describe('isRetryableError', () => {
    it('should return true for network error (status 0)', () => {
      expect(isRetryableError(0)).toBe(true);
    });

    it('should return true for timeout (status 408)', () => {
      expect(isRetryableError(408)).toBe(true);
    });

    it('should return true for too many requests (status 429)', () => {
      expect(isRetryableError(429)).toBe(true);
    });

    it('should return true for server errors (5xx)', () => {
      expect(isRetryableError(500)).toBe(true);
      expect(isRetryableError(502)).toBe(true);
      expect(isRetryableError(503)).toBe(true);
    });

    it('should return false for client errors (4xx except 408 and 429)', () => {
      expect(isRetryableError(400)).toBe(false);
      expect(isRetryableError(401)).toBe(false);
      expect(isRetryableError(403)).toBe(false);
      expect(isRetryableError(404)).toBe(false);
    });

    it('should return false for successful responses (2xx)', () => {
      expect(isRetryableError(200)).toBe(false);
      expect(isRetryableError(201)).toBe(false);
    });
  });

  describe('extractErrorInfo', () => {
    it('should extract error info from response', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          error: 'NOT_FOUND',
          message: 'Resource not found',
          details: ['ID does not exist'],
        }),
        status: 404,
      } as unknown as Response;

      const result = await extractErrorInfo(mockResponse);

      expect(result).toEqual({
        type: 'warning',
        message: COMMON_ERROR_MESSAGES.NOT_FOUND,
        details: ['ID does not exist'],
        shouldRetry: false,
      });
    });

    it('should mark server errors as retryable', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          error: 'INTERNAL_ERROR',
          message: 'Server error',
        }),
        status: 500,
      } as unknown as Response;

      const result = await extractErrorInfo(mockResponse);

      expect(result.shouldRetry).toBe(true);
      expect(result.type).toBe('error');
    });

    it('should not mark client errors as retryable', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          error: 'VALIDATION_ERROR',
          message: 'Invalid input',
        }),
        status: 400,
      } as unknown as Response;

      const result = await extractErrorInfo(mockResponse);

      expect(result.shouldRetry).toBe(false);
      expect(result.type).toBe('warning');
    });
  });
});
