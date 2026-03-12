import { describe, it, expect } from '@jest/globals';
import { COMMON_ERROR_MESSAGES } from '../../../src/constants/error-messages.js';
import type { CommonErrorMessageKey } from '../../../src/constants/error-messages.js';

describe('COMMON_ERROR_MESSAGES', () => {
  it('HTTPステータスに対応する共通エラーメッセージを提供する', () => {
    expect(COMMON_ERROR_MESSAGES).toEqual({
      UNAUTHORIZED: '認証が必要です',
      FORBIDDEN: 'アクセス権限がありません',
      NOT_FOUND: '対象のデータが見つかりません',
      VALIDATION_ERROR: '入力内容が不正です',
      INTERNAL_SERVER_ERROR: 'サーバーエラーが発生しました',
    });
  });

  it('CommonErrorMessageKey型がキーを受け入れる', () => {
    const keys: CommonErrorMessageKey[] = [
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'VALIDATION_ERROR',
      'INTERNAL_SERVER_ERROR',
    ];

    expect(keys).toHaveLength(5);
  });
});
