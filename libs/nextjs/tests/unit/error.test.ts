/**
 * Error Handler Unit Tests
 */

import { describe, it, expect } from '@jest/globals';
import { handleApiError } from '../../src/error';
import { ERROR_CODES } from '@nagiyu/common';

describe('handleApiError', () => {
  it('NotFoundエラーを404レスポンスに変換する', () => {
    const error = new Error('データが見つかりません');
    error.name = 'EntityNotFoundError';
    const response = handleApiError(error);
    expect(response.status).toBe(404);
  });

  it('AlreadyExistsエラーを400レスポンスに変換する', () => {
    const error = new Error('既に存在します');
    error.name = 'EntityAlreadyExistsError';
    const response = handleApiError(error);
    expect(response.status).toBe(400);
  });

  it('InvalidEntityDataErrorを400レスポンスに変換する', () => {
    const error = new Error('無効なデータです');
    error.name = 'InvalidEntityDataError';
    const response = handleApiError(error);
    expect(response.status).toBe(400);
  });

  it('その他のエラーを500レスポンスに変換する', () => {
    const error = new Error('予期しないエラー');
    const response = handleApiError(error);
    expect(response.status).toBe(500);
  });

  it('Error以外のオブジェクトを500レスポンスに変換する', () => {
    const error = { message: 'unknown error' };
    const response = handleApiError(error);
    expect(response.status).toBe(500);
  });

  it('文字列エラーを500レスポンスに変換する', () => {
    const error = 'string error';
    const response = handleApiError(error);
    expect(response.status).toBe(500);
  });

  it('nullエラーを500レスポンスに変換する', () => {
    const error = null;
    const response = handleApiError(error);
    expect(response.status).toBe(500);
  });

  it('undefinedエラーを500レスポンスに変換する', () => {
    const error = undefined;
    const response = handleApiError(error);
    expect(response.status).toBe(500);
  });

  it('NotFoundエラーにカスタムメッセージがある場合、そのメッセージを使用する', () => {
    const error = new Error('カスタムメッセージ');
    error.name = 'EntityNotFoundError';
    const response = handleApiError(error);
    expect(response.status).toBe(404);
  });

  it('部分一致でエラー名を判定する（UserNotFoundError）', () => {
    const error = new Error('ユーザーが見つかりません');
    error.name = 'UserNotFoundError';
    const response = handleApiError(error);
    expect(response.status).toBe(404);
  });

  it('部分一致でエラー名を判定する（TickerAlreadyExistsError）', () => {
    const error = new Error('ティッカーが既に存在します');
    error.name = 'TickerAlreadyExistsError';
    const response = handleApiError(error);
    expect(response.status).toBe(400);
  });

  it('部分一致でエラー名を判定する（InvalidHoldingDataError）', () => {
    const error = new Error('無効な保有株式データ');
    error.name = 'InvalidHoldingDataError';
    const response = handleApiError(error);
    expect(response.status).toBe(400);
  });
});
