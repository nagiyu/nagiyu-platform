/**
 * エラーハンドラーのユニットテスト
 */

import { describe, it, expect } from '@jest/globals';
import {
  getErrorTypeFromStatus,
  handleFetchError,
  mapAPIErrorToMessage,
  isRetryableError,
  COMMON_ERROR_MESSAGES,
} from '../../src/error-handler';

describe('error-handler', () => {
  describe('getErrorTypeFromStatus', () => {
    it('500以上のステータスコードは"error"を返す', () => {
      expect(getErrorTypeFromStatus(500)).toBe('error');
      expect(getErrorTypeFromStatus(502)).toBe('error');
      expect(getErrorTypeFromStatus(503)).toBe('error');
    });

    it('400以上500未満のステータスコードは"warning"を返す', () => {
      expect(getErrorTypeFromStatus(400)).toBe('warning');
      expect(getErrorTypeFromStatus(404)).toBe('warning');
      expect(getErrorTypeFromStatus(422)).toBe('warning');
    });

    it('400未満のステータスコードは"info"を返す', () => {
      expect(getErrorTypeFromStatus(200)).toBe('info');
      expect(getErrorTypeFromStatus(300)).toBe('info');
    });
  });

  describe('handleFetchError', () => {
    it('ネットワークエラーを処理する', () => {
      const error = new TypeError('Failed to fetch');
      const result = handleFetchError(error);

      expect(result.type).toBe('error');
      expect(result.message).toBe(COMMON_ERROR_MESSAGES.NETWORK_ERROR);
      expect(result.shouldRetry).toBe(true);
    });

    it('タイムアウトエラーを処理する', () => {
      const error = new Error('Request timeout');
      error.name = 'AbortError';
      const result = handleFetchError(error);

      expect(result.type).toBe('error');
      expect(result.message).toBe(COMMON_ERROR_MESSAGES.TIMEOUT_ERROR);
      expect(result.shouldRetry).toBe(true);
    });

    it('その他のエラーを処理する', () => {
      const error = new Error('Unknown error');
      const result = handleFetchError(error);

      expect(result.type).toBe('error');
      expect(result.message).toBe(COMMON_ERROR_MESSAGES.UNKNOWN_ERROR);
      expect(result.shouldRetry).toBe(false);
    });
  });

  describe('mapAPIErrorToMessage', () => {
    it('サービス固有メッセージを優先する', () => {
      const errorResponse = { error: 'CUSTOM_ERROR', message: 'API message' };
      const serviceMessages = { CUSTOM_ERROR: 'カスタムエラーメッセージ' };

      const result = mapAPIErrorToMessage(errorResponse, serviceMessages);
      expect(result).toBe('カスタムエラーメッセージ');
    });

    it('共通メッセージにマップする', () => {
      const errorResponse = { error: 'UNAUTHORIZED', message: 'Unauthorized' };
      const result = mapAPIErrorToMessage(errorResponse);
      expect(result).toBe(COMMON_ERROR_MESSAGES.UNAUTHORIZED);
    });

    it('APIレスポンスのメッセージを使用する', () => {
      const errorResponse = { error: 'UNKNOWN_CODE', message: 'API specific message' };
      const result = mapAPIErrorToMessage(errorResponse);
      expect(result).toBe('API specific message');
    });

    it('メッセージがない場合はデフォルトメッセージを使用する', () => {
      const errorResponse = { error: 'UNKNOWN_CODE', message: '' };
      const result = mapAPIErrorToMessage(errorResponse);
      expect(result).toBe(COMMON_ERROR_MESSAGES.UNKNOWN_ERROR);
    });
  });

  describe('isRetryableError', () => {
    it('ネットワークエラー(status=0)はリトライ可能', () => {
      expect(isRetryableError(0)).toBe(true);
    });

    it('タイムアウト(status=408)はリトライ可能', () => {
      expect(isRetryableError(408)).toBe(true);
    });

    it('Too Many Requests(status=429)はリトライ可能', () => {
      expect(isRetryableError(429)).toBe(true);
    });

    it('サーバーエラー(5xx)はリトライ可能', () => {
      expect(isRetryableError(500)).toBe(true);
      expect(isRetryableError(502)).toBe(true);
      expect(isRetryableError(503)).toBe(true);
    });

    it('クライアントエラー(4xx)はリトライ不可', () => {
      expect(isRetryableError(400)).toBe(false);
      expect(isRetryableError(404)).toBe(false);
      expect(isRetryableError(422)).toBe(false);
    });

    it('成功ステータス(2xx)はリトライ不可', () => {
      expect(isRetryableError(200)).toBe(false);
      expect(isRetryableError(201)).toBe(false);
    });
  });

  describe('COMMON_ERROR_MESSAGES', () => {
    it('すべてのエラーメッセージが定義されている', () => {
      expect(COMMON_ERROR_MESSAGES.UNAUTHORIZED).toBeDefined();
      expect(COMMON_ERROR_MESSAGES.FORBIDDEN).toBeDefined();
      expect(COMMON_ERROR_MESSAGES.SESSION_EXPIRED).toBeDefined();
      expect(COMMON_ERROR_MESSAGES.NETWORK_ERROR).toBeDefined();
      expect(COMMON_ERROR_MESSAGES.TIMEOUT_ERROR).toBeDefined();
      expect(COMMON_ERROR_MESSAGES.SERVER_ERROR).toBeDefined();
      expect(COMMON_ERROR_MESSAGES.INVALID_REQUEST).toBeDefined();
      expect(COMMON_ERROR_MESSAGES.VALIDATION_ERROR).toBeDefined();
      expect(COMMON_ERROR_MESSAGES.NOT_FOUND).toBeDefined();
      expect(COMMON_ERROR_MESSAGES.CREATE_ERROR).toBeDefined();
      expect(COMMON_ERROR_MESSAGES.UPDATE_ERROR).toBeDefined();
      expect(COMMON_ERROR_MESSAGES.DELETE_ERROR).toBeDefined();
      expect(COMMON_ERROR_MESSAGES.FETCH_ERROR).toBeDefined();
      expect(COMMON_ERROR_MESSAGES.UNKNOWN_ERROR).toBeDefined();
    });

    it('すべてのメッセージが日本語', () => {
      Object.values(COMMON_ERROR_MESSAGES).forEach((message) => {
        // 日本語を含むことを確認（簡易的なチェック）
        expect(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(message)).toBe(true);
      });
    });
  });
});
