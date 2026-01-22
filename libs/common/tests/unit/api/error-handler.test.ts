/**
 * エラーハンドリングユーティリティのテスト
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
    it('5xxエラーは"error"を返す', () => {
      expect(getErrorTypeFromStatus(500)).toBe('error');
      expect(getErrorTypeFromStatus(503)).toBe('error');
    });

    it('4xxエラーは"warning"を返す', () => {
      expect(getErrorTypeFromStatus(400)).toBe('warning');
      expect(getErrorTypeFromStatus(404)).toBe('warning');
    });

    it('2xx/3xxは"info"を返す', () => {
      expect(getErrorTypeFromStatus(200)).toBe('info');
      expect(getErrorTypeFromStatus(301)).toBe('info');
    });
  });

  describe('parseErrorResponse', () => {
    it('正常なJSONエラーレスポンスをパースできる', async () => {
      const mockResponse = {
        json: async () => ({
          error: 'NOT_FOUND',
          message: 'リソースが見つかりません',
          details: ['詳細情報'],
        }),
        status: 404,
      } as Response;

      const result = await parseErrorResponse(mockResponse);

      expect(result).toEqual({
        error: 'NOT_FOUND',
        message: 'リソースが見つかりません',
        details: ['詳細情報'],
      });
    });

    it('JSONパースエラー時はデフォルトメッセージを返す', async () => {
      const mockResponse = {
        json: async () => {
          throw new Error('Parse error');
        },
        status: 500,
      } as Response;

      const result = await parseErrorResponse(mockResponse);

      expect(result).toEqual({
        error: 'HTTP_ERROR',
        message: 'HTTPエラー: 500',
      });
    });

    it('エラーフィールドが不完全な場合はデフォルトメッセージを返す', async () => {
      const mockResponse = {
        json: async () => ({
          error: 'SOME_ERROR',
          // messageフィールドが欠けている
        }),
        status: 400,
      } as Response;

      const result = await parseErrorResponse(mockResponse);

      expect(result).toEqual({
        error: 'HTTP_ERROR',
        message: 'HTTPエラー: 400',
      });
    });
  });

  describe('handleFetchError', () => {
    it('ネットワークエラーを正しく処理する', () => {
      const error = new TypeError('Failed to fetch');
      const result = handleFetchError(error);

      expect(result).toEqual({
        type: 'error',
        message: COMMON_ERROR_MESSAGES.NETWORK_ERROR,
        shouldRetry: true,
      });
    });

    it('タイムアウトエラーを正しく処理する', () => {
      const error = new Error('Timeout');
      error.name = 'AbortError';
      const result = handleFetchError(error);

      expect(result).toEqual({
        type: 'error',
        message: COMMON_ERROR_MESSAGES.TIMEOUT_ERROR,
        shouldRetry: true,
      });
    });

    it('その他のエラーは未知のエラーとして処理する', () => {
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
    it('共通メッセージマッピングが正しく機能する', () => {
      const errorResponse: APIErrorResponse = {
        error: 'UNAUTHORIZED',
        message: 'Unauthorized',
      };

      const result = mapAPIErrorToMessage(errorResponse);

      expect(result).toBe(COMMON_ERROR_MESSAGES.UNAUTHORIZED);
    });

    it('サービス固有メッセージが優先される（2段階マッピング）', () => {
      const errorResponse: APIErrorResponse = {
        error: 'CUSTOM_ERROR',
        message: 'デフォルトメッセージ',
      };

      const serviceMessages = {
        CUSTOM_ERROR: 'カスタムエラーメッセージ',
      };

      const result = mapAPIErrorToMessage(errorResponse, serviceMessages);

      expect(result).toBe('カスタムエラーメッセージ');
    });

    it('サービス固有メッセージが設定されていても、共通メッセージにフォールバック', () => {
      const errorResponse: APIErrorResponse = {
        error: 'UNAUTHORIZED',
        message: 'Unauthorized',
      };

      const serviceMessages = {
        CUSTOM_ERROR: 'カスタムエラーメッセージ',
      };

      const result = mapAPIErrorToMessage(errorResponse, serviceMessages);

      // UNAUTHORIZED は共通メッセージマッピングに存在するため、共通メッセージが返される
      expect(result).toBe(COMMON_ERROR_MESSAGES.UNAUTHORIZED);
    });

    it('マッピングされていないエラーコードはAPIレスポンスのメッセージを返す', () => {
      const errorResponse: APIErrorResponse = {
        error: 'UNKNOWN_CODE',
        message: 'APIが返したメッセージ',
      };

      const result = mapAPIErrorToMessage(errorResponse);

      expect(result).toBe('APIが返したメッセージ');
    });

    it('マッピングされておらず、APIメッセージもない場合はUNKNOWN_ERRORを返す', () => {
      const errorResponse: APIErrorResponse = {
        error: 'UNKNOWN_CODE',
        message: '',
      };

      const result = mapAPIErrorToMessage(errorResponse);

      expect(result).toBe(COMMON_ERROR_MESSAGES.UNKNOWN_ERROR);
    });
  });

  describe('isRetryableError', () => {
    it('ネットワークエラー（status 0）はリトライ可能', () => {
      expect(isRetryableError(0)).toBe(true);
    });

    it('タイムアウトエラー（status 408）はリトライ可能', () => {
      expect(isRetryableError(408)).toBe(true);
    });

    it('Too Many Requests（status 429）はリトライ可能', () => {
      expect(isRetryableError(429)).toBe(true);
    });

    it('5xxエラーはリトライ可能', () => {
      expect(isRetryableError(500)).toBe(true);
      expect(isRetryableError(503)).toBe(true);
    });

    it('4xxエラー（408と429以外）はリトライ不可', () => {
      expect(isRetryableError(400)).toBe(false);
      expect(isRetryableError(401)).toBe(false);
      expect(isRetryableError(403)).toBe(false);
      expect(isRetryableError(404)).toBe(false);
    });

    it('2xx/3xxエラーはリトライ不可', () => {
      expect(isRetryableError(200)).toBe(false);
      expect(isRetryableError(301)).toBe(false);
    });
  });

  describe('extractErrorInfo', () => {
    it('エラー情報を正しく抽出する', async () => {
      const mockResponse = {
        json: async () => ({
          error: 'NOT_FOUND',
          message: 'リソースが見つかりません',
          details: ['詳細情報'],
        }),
        status: 404,
      } as Response;

      const result = await extractErrorInfo(mockResponse);

      expect(result).toEqual({
        type: 'warning',
        message: COMMON_ERROR_MESSAGES.NOT_FOUND,
        details: ['詳細情報'],
        shouldRetry: false,
      });
    });

    it('サービス固有メッセージを使用できる', async () => {
      const mockResponse = {
        json: async () => ({
          error: 'CUSTOM_ERROR',
          message: 'デフォルトメッセージ',
        }),
        status: 500,
      } as Response;

      const serviceMessages = {
        CUSTOM_ERROR: 'カスタムエラーメッセージ',
      };

      const result = await extractErrorInfo(mockResponse, serviceMessages);

      expect(result).toEqual({
        type: 'error',
        message: 'カスタムエラーメッセージ',
        details: undefined,
        shouldRetry: true,
      });
    });
  });
});
