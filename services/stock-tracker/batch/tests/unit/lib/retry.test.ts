/**
 * Retry ユーティリティのテスト
 */

import { withRetry, DEFAULT_RETRY_OPTIONS } from '../../../src/lib/retry.js';

// Logger のモック化
jest.mock('../../../src/lib/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('withRetry', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    // console.error をモック化してエラー出力を抑制
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  it('成功時は1回で完了する', async () => {
    const fn = jest.fn().mockResolvedValue('success');

    const promise = withRetry(fn);
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('失敗してもリトライして成功する', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('一時的なエラー'))
      .mockResolvedValue('success');

    const promise = withRetry(fn, { initialDelayMs: 10 });
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('最大リトライ回数まで失敗すると例外をスローする', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('恒久的なエラー'));

    const promise = withRetry(fn, { maxRetries: 2, initialDelayMs: 10 });

    // runAllTimersAsync と expect().rejects を並行して実行
    const [, result] = await Promise.all([jest.runAllTimersAsync(), promise.catch((err) => err)]);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('恒久的なエラー');
    expect(fn).toHaveBeenCalledTimes(3); // 初回 + リトライ2回
  });

  it('指数バックオフで待機時間が増加する', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('エラー'));

    const promise = withRetry(fn, {
      maxRetries: 2,
      initialDelayMs: 10,
      backoffMultiplier: 2,
    });

    // runAllTimersAsync と catch を並行して実行
    await Promise.all([
      jest.runAllTimersAsync(),
      promise.catch(() => {
        /* エラーを無視 */
      }),
    ]);

    // 初回 + リトライ2回 = 3回実行されること
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('shouldRetry がfalseを返すとリトライしない', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('リトライ不要なエラー'));

    const promise = withRetry(fn, {
      shouldRetry: () => false,
    });

    await expect(promise).rejects.toThrow('リトライ不要なエラー');
    expect(fn).toHaveBeenCalledTimes(1); // リトライせず初回のみ
  });

  it('shouldRetry がtrueを返すとリトライする', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('リトライ可能なエラー'))
      .mockResolvedValue('success');

    const promise = withRetry(fn, {
      shouldRetry: (error) => error.message.includes('リトライ可能'),
      initialDelayMs: 10,
    });

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('デフォルトオプションが正しく適用される', () => {
    expect(DEFAULT_RETRY_OPTIONS.maxRetries).toBe(3);
    expect(DEFAULT_RETRY_OPTIONS.initialDelayMs).toBe(1000);
    expect(DEFAULT_RETRY_OPTIONS.backoffMultiplier).toBe(2);
  });
});
