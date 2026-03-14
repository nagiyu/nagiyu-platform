import { describe, it, expect } from '@jest/globals';
import { COMMON_ERROR_MESSAGES } from '../../../src/constants/error-messages.js';
import type { CommonErrorMessageKey } from '../../../src/constants/error-messages.js';

describe('COMMON_ERROR_MESSAGES', () => {
  it('HTTPステータスに対応する共通エラーメッセージを提供する', () => {
    expect(COMMON_ERROR_MESSAGES).toEqual({
      UNAUTHORIZED: '認証が必要です',
      FORBIDDEN: 'アクセス権限がありません',
      SESSION_EXPIRED: 'セッションが期限切れです。再度ログインしてください',
      NETWORK_ERROR: 'ネットワーク接続を確認してください',
      TIMEOUT_ERROR: '接続がタイムアウトしました。しばらくしてから再度お試しください',
      SERVER_ERROR: 'サーバーエラーが発生しました。しばらくしてから再度お試しください',
      INVALID_REQUEST: '入力内容に誤りがあります。確認してください',
      NOT_FOUND: '対象のデータが見つかりません',
      VALIDATION_ERROR: '入力内容が不正です',
      CREATE_ERROR: '登録に失敗しました',
      UPDATE_ERROR: '更新に失敗しました',
      DELETE_ERROR: '削除に失敗しました',
      FETCH_ERROR: 'データの取得に失敗しました',
      UNKNOWN_ERROR: '予期しないエラーが発生しました',
      INTERNAL_SERVER_ERROR: 'サーバーエラーが発生しました',
    });
  });

  it('CommonErrorMessageKey型がキーを受け入れる', () => {
    const keys: CommonErrorMessageKey[] = [
      'UNAUTHORIZED',
      'FORBIDDEN',
      'SESSION_EXPIRED',
      'NETWORK_ERROR',
      'TIMEOUT_ERROR',
      'SERVER_ERROR',
      'INVALID_REQUEST',
      'NOT_FOUND',
      'VALIDATION_ERROR',
      'CREATE_ERROR',
      'UPDATE_ERROR',
      'DELETE_ERROR',
      'FETCH_ERROR',
      'UNKNOWN_ERROR',
      'INTERNAL_SERVER_ERROR',
    ];

    expect(keys).toHaveLength(15);
  });
});
