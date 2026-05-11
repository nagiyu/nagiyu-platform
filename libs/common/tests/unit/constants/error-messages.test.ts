import { describe, it, expect } from '@jest/globals';
import { COMMON_ERROR_MESSAGES } from '../../../src/constants/error-messages.js';
import type { CommonErrorMessageKey } from '../../../src/constants/error-messages.js';

describe('COMMON_ERROR_MESSAGES', () => {
  it('HTTPステータスに対応する共通エラーメッセージを提供する', () => {
    expect(COMMON_ERROR_MESSAGES).toEqual({
      UNAUTHORIZED: '認証が必要です',
      FORBIDDEN: 'この操作を実行する権限がありません',
      SESSION_EXPIRED: 'セッションが期限切れです。再度ログインしてください',
      NETWORK_ERROR: 'ネットワーク接続を確認してください',
      NETWORK_ERROR_OCCURRED: 'ネットワークエラーが発生しました',
      TIMEOUT_ERROR: '接続がタイムアウトしました。しばらくしてから再度お試しください',
      SERVER_ERROR: 'サーバーエラーが発生しました。しばらくしてから再度お試しください',
      BAD_REQUEST: 'リクエストが不正です',
      INVALID_REQUEST: '入力内容に誤りがあります。確認してください',
      INVALID_REQUEST_BODY: 'リクエストボディが不正です',
      INVALID_REQUEST_PARAMS: 'リクエストパラメータが不正です',
      NOT_FOUND: '対象のデータが見つかりません',
      USER_NOT_FOUND: 'ユーザーが見つかりません',
      JOB_NOT_FOUND: '指定されたジョブが見つかりません',
      VALIDATION_ERROR: '入力内容が不正です',
      UPDATE_FIELDS_REQUIRED: '更新するフィールドが指定されていません',
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
      'NETWORK_ERROR_OCCURRED',
      'TIMEOUT_ERROR',
      'SERVER_ERROR',
      'BAD_REQUEST',
      'INVALID_REQUEST',
      'INVALID_REQUEST_BODY',
      'INVALID_REQUEST_PARAMS',
      'NOT_FOUND',
      'USER_NOT_FOUND',
      'JOB_NOT_FOUND',
      'VALIDATION_ERROR',
      'UPDATE_FIELDS_REQUIRED',
      'CREATE_ERROR',
      'UPDATE_ERROR',
      'DELETE_ERROR',
      'FETCH_ERROR',
      'UNKNOWN_ERROR',
      'INTERNAL_SERVER_ERROR',
    ];

    expect(keys).toHaveLength(22);
  });
});
