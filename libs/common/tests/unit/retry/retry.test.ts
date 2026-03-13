import { withRetry, DEFAULT_RETRY_OPTIONS } from '../../../src/retry/retry.js';

describe('withRetry', () => {
  const mockLogger = {
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('成功時は1回で完了する', async () => {
    const fn = jest.fn().mockResolvedValue('success');

    const promise = withRetry(fn, { logger: mockLogger });
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('失敗後にリトライして成功する', async () => {
    const fn = jest.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValue('success');

    const promise = withRetry(fn, { initialDelayMs: 10, logger: mockLogger });
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
  });

  it('最大リトライ回数に達した場合は例外を投げる', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('failed'));

    const promise = withRetry(fn, { maxRetries: 2, initialDelayMs: 10, logger: mockLogger });
    const [, error] = await Promise.all([jest.runAllTimersAsync(), promise.catch((err) => err)]);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('failed');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
  });

  it('shouldRetry が false の場合はリトライしない', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('non-retryable'));

    await expect(
      withRetry(fn, {
        shouldRetry: () => false,
        logger: mockLogger,
      })
    ).rejects.toThrow('non-retryable');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('デフォルトオプションを公開している', () => {
    expect(DEFAULT_RETRY_OPTIONS).toEqual({
      maxRetries: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
    });
  });
});
