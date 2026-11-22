/**
 * Web Push クライアントのユニットテスト
 */

import { createBatchCompletionPayload } from '../../src/lib/web-push-client.js';
import { normalizeVapidKey } from '@nagiyu/common';

// web-push は ESM 専用で Jest が読み込めない。このテストは送信を検証しないため空のモックに差し替える。
// web-push は @nagiyu/common の依存でこのサービスからは解決できないため virtual を付ける
jest.mock('web-push', () => ({}), { virtual: true });

describe('createBatchCompletionPayload', () => {
  test('全件成功時の通知ペイロード', () => {
    const payload = createBatchCompletionPayload('job-123', 10, 0, 10);

    expect(payload).toEqual({
      title: 'マイリスト登録完了',
      body: '全 10 件のマイリスト登録が完了しました',
      icon: '/icon-192x192.png',
      data: {
        jobId: 'job-123',
        registeredCount: 10,
        failedCount: 0,
        totalCount: 10,
        type: 'batch-completion',
      },
    });
  });

  test('全件失敗時の通知ペイロード', () => {
    const payload = createBatchCompletionPayload('job-456', 0, 5, 5);

    expect(payload).toEqual({
      title: 'マイリスト登録完了',
      body: 'マイリスト登録に失敗しました（5 件）',
      icon: '/icon-192x192.png',
      data: {
        jobId: 'job-456',
        registeredCount: 0,
        failedCount: 5,
        totalCount: 5,
        type: 'batch-completion',
      },
    });
  });

  test('一部成功時の通知ペイロード', () => {
    const payload = createBatchCompletionPayload('job-789', 8, 2, 10);

    expect(payload).toEqual({
      title: 'マイリスト登録完了',
      body: '8 件登録完了、2 件失敗（成功率 80%）',
      icon: '/icon-192x192.png',
      data: {
        jobId: 'job-789',
        registeredCount: 8,
        failedCount: 2,
        totalCount: 10,
        type: 'batch-completion',
      },
    });
  });

  test('成功率の丸め処理（切り捨て）', () => {
    const payload = createBatchCompletionPayload('job-abc', 2, 1, 3);

    // 2/3 = 66.666...% → 67%（四捨五入）
    expect(payload.body).toBe('2 件登録完了、1 件失敗（成功率 67%）');
  });

  test('総件数0の場合', () => {
    const payload = createBatchCompletionPayload('job-zero', 0, 0, 0);

    expect(payload).toEqual({
      title: 'マイリスト登録完了',
      body: '全 0 件のマイリスト登録が完了しました',
      icon: '/icon-192x192.png',
      data: {
        jobId: 'job-zero',
        registeredCount: 0,
        failedCount: 0,
        totalCount: 0,
        type: 'batch-completion',
      },
    });
  });
});

describe('normalizeVapidKey', () => {
  test('前後の空白を除去する', () => {
    expect(normalizeVapidKey('  test-key  ', 'publicKey')).toBe('test-key');
  });

  test('引用符で囲まれた値を正規化する', () => {
    expect(normalizeVapidKey('"test-key"', 'publicKey')).toBe('test-key');
  });

  test('JSON文字列から指定キーを抽出する', () => {
    const raw = '{"publicKey":"public-value","privateKey":"private-value"}';
    expect(normalizeVapidKey(raw, 'publicKey')).toBe('public-value');
    expect(normalizeVapidKey(raw, 'privateKey')).toBe('private-value');
  });

  test('エスケープされたJSON文字列から指定キーを抽出する', () => {
    const raw = '"{\\"publicKey\\":\\"public-value\\",\\"privateKey\\":\\"private-value\\"}"';
    expect(normalizeVapidKey(raw, 'publicKey')).toBe('public-value');
    expect(normalizeVapidKey(raw, 'privateKey')).toBe('private-value');
  });
});
