import { withTimeout } from '../../../src/retry/timeout.js';

describe('withTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('timeoutMs 以内に解決すればその値を返す', async () => {
    const promise = Promise.resolve('success');

    const result = await withTimeout(promise, 1000, 'タイムアウトしました');

    expect(result).toBe('success');
  });

  it('timeoutMs 以内に解決しなければ timeoutMessage で reject する', async () => {
    const neverResolves = new Promise<string>(() => {});

    const resultPromise = withTimeout(neverResolves, 1000, 'カスタムタイムアウトメッセージ');
    const assertion = expect(resultPromise).rejects.toThrow('カスタムタイムアウトメッセージ');

    await jest.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('成功時はタイマーがクリアされ、タイムアウトが発火しない', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    await withTimeout(Promise.resolve('success'), 1000, 'タイムアウトしました');

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('失敗時もタイマーがクリアされる', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    await expect(
      withTimeout(Promise.reject(new Error('元のエラー')), 1000, 'タイムアウトしました')
    ).rejects.toThrow('元のエラー');

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
