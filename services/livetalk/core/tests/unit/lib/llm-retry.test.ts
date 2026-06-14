import OpenAI from 'openai';
import {
  LLM_RETRY_OPTIONS,
  LLMTimeoutError,
  isRetryableLLMError,
  withLLMTimeout,
  withLLMRetry,
} from '../../../src/lib/llm-retry.js';

/** OpenAI エラー生成用ヘルパー（headers の get メソッドを持つ最低限のモック） */
const headersLike = { get: () => null } as unknown as Headers;

/** APIError を指定ステータスで生成する */
function makeAPIError(status: number): InstanceType<typeof OpenAI.APIError> {
  return new OpenAI.APIError(status, { message: `HTTP ${status}` }, `HTTP ${status}`, headersLike);
}

describe('LLM_RETRY_OPTIONS', () => {
  it('maxRetries が 3 である', () => {
    expect(LLM_RETRY_OPTIONS.maxRetries).toBe(3);
  });

  it('initialDelayMs が 1000 である', () => {
    expect(LLM_RETRY_OPTIONS.initialDelayMs).toBe(1000);
  });

  it('backoffMultiplier が 2 である', () => {
    expect(LLM_RETRY_OPTIONS.backoffMultiplier).toBe(2);
  });
});

describe('LLMTimeoutError', () => {
  it('Error のインスタンスである', () => {
    const err = new LLMTimeoutError('タイムアウト');
    expect(err).toBeInstanceOf(Error);
  });

  it('LLMTimeoutError のインスタンスである', () => {
    const err = new LLMTimeoutError('タイムアウト');
    expect(err).toBeInstanceOf(LLMTimeoutError);
  });

  it('name が "LLMTimeoutError" である', () => {
    const err = new LLMTimeoutError('タイムアウト');
    expect(err.name).toBe('LLMTimeoutError');
  });

  it('メッセージが正しく設定される', () => {
    const err = new LLMTimeoutError('テストメッセージ');
    expect(err.message).toBe('テストメッセージ');
  });
});

describe('isRetryableLLMError', () => {
  describe('リトライ可能なエラー', () => {
    it('LLMTimeoutError は true を返す', () => {
      expect(isRetryableLLMError(new LLMTimeoutError('timeout'))).toBe(true);
    });

    it('APIConnectionError は true を返す', () => {
      const err = new OpenAI.APIConnectionError({
        message: '接続エラー',
        cause: new Error('原因'),
      });
      expect(isRetryableLLMError(err)).toBe(true);
    });

    it('APIConnectionTimeoutError は true を返す（APIConnectionError のサブクラス）', () => {
      const err = new OpenAI.APIConnectionTimeoutError({ message: 'request timed out' });
      expect(isRetryableLLMError(err)).toBe(true);
    });

    it('APIError status 408 は true を返す', () => {
      expect(isRetryableLLMError(makeAPIError(408))).toBe(true);
    });

    it('APIError status 409 は true を返す', () => {
      expect(isRetryableLLMError(new OpenAI.ConflictError(409, {}, '', headersLike))).toBe(true);
    });

    it('APIError status 429 は true を返す', () => {
      expect(
        isRetryableLLMError(new OpenAI.RateLimitError(429, {}, 'rate limit', headersLike))
      ).toBe(true);
    });

    it('APIError status 500 は true を返す', () => {
      expect(
        isRetryableLLMError(new OpenAI.InternalServerError(500, {}, 'internal', headersLike))
      ).toBe(true);
    });

    it('APIError status 503 は true を返す', () => {
      expect(isRetryableLLMError(makeAPIError(503))).toBe(true);
    });
  });

  describe('リトライ不可なエラー', () => {
    it('APIError status 400 は false を返す', () => {
      expect(isRetryableLLMError(new OpenAI.BadRequestError(400, {}, 'bad', headersLike))).toBe(
        false
      );
    });

    it('APIError status 401 は false を返す', () => {
      expect(
        isRetryableLLMError(new OpenAI.AuthenticationError(401, {}, 'unauth', headersLike))
      ).toBe(false);
    });

    it('APIError status 403 は false を返す', () => {
      expect(
        isRetryableLLMError(new OpenAI.PermissionDeniedError(403, {}, 'forbidden', headersLike))
      ).toBe(false);
    });

    it('APIError status 404 は false を返す', () => {
      expect(isRetryableLLMError(new OpenAI.NotFoundError(404, {}, 'not found', headersLike))).toBe(
        false
      );
    });

    it('APIUserAbortError（status が undefined の APIError）は false を返す', () => {
      // APIUserAbortError は APIError のサブクラスだが status が undefined
      const err = new OpenAI.APIUserAbortError();
      expect(isRetryableLLMError(err)).toBe(false);
    });

    it('無関係な Error は false を返す', () => {
      expect(isRetryableLLMError(new Error('一般的なエラー'))).toBe(false);
    });
  });
});

describe('withLLMTimeout', () => {
  it('タイムアウト前に解決すれば値を返す', async () => {
    const promise = Promise.resolve('成功');
    const result = await withLLMTimeout(promise, 5000, 'タイムアウト');
    expect(result).toBe('成功');
  });

  it('タイムアウトを超えると LLMTimeoutError を throw する', async () => {
    jest.useFakeTimers();
    try {
      const neverResolves = new Promise<string>(() => {
        // 永遠に解決しない
      });

      // 先に catch を登録してから timer を進める（unhandled rejection を防ぐ）
      const resultPromise = withLLMTimeout(neverResolves, 3000, 'テストタイムアウト');
      const caughtPromise = resultPromise.catch((err: unknown) => err);

      // タイマーを全て消化してタイムアウトを発火させる
      await jest.runAllTimersAsync();

      const caughtError = await caughtPromise;
      expect(caughtError).toBeInstanceOf(LLMTimeoutError);
      expect((caughtError as Error).message).toBe('テストタイムアウト');
    } finally {
      jest.useRealTimers();
    }
  });

  it('タイムアウト時のエラーは LLMTimeoutError のインスタンスである', async () => {
    jest.useFakeTimers();
    try {
      const neverResolves = new Promise<string>(() => {});
      const resultPromise = withLLMTimeout(neverResolves, 1000, 'タイムアウト');
      const caughtPromise = resultPromise.catch((err: unknown) => err);

      await jest.runAllTimersAsync();

      const caughtError = await caughtPromise;
      expect(caughtError).toBeInstanceOf(LLMTimeoutError);
    } finally {
      jest.useRealTimers();
    }
  });

  it('Promise が先に reject した場合はそのエラーを伝播する', async () => {
    const failingPromise = Promise.reject(new Error('API エラー'));
    await expect(withLLMTimeout(failingPromise, 5000, 'タイムアウト')).rejects.toThrow(
      'API エラー'
    );
  });
});

describe('withLLMRetry', () => {
  it('最初の呼び出しで成功すれば fn が 1 回だけ呼ばれ値を返す', async () => {
    const fn = jest.fn().mockResolvedValue('結果');
    const result = await withLLMRetry(fn);
    expect(result).toBe('結果');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('恒久的エラー（status 400）は即時 reject かつ fn が 1 回だけ呼ばれる', async () => {
    const badRequestError = new OpenAI.BadRequestError(400, {}, 'bad request', headersLike);
    const fn = jest.fn().mockRejectedValue(badRequestError);

    await expect(withLLMRetry(fn)).rejects.toThrow(badRequestError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('恒久的エラー（status 401）は即時 reject かつ fn が 1 回だけ呼ばれる', async () => {
    const authError = new OpenAI.AuthenticationError(401, {}, 'unauthorized', headersLike);
    const fn = jest.fn().mockRejectedValue(authError);

    await expect(withLLMRetry(fn)).rejects.toThrow(authError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('一過性エラー後に成功すれば最終的に値を返す（fn が複数回呼ばれる）', async () => {
    jest.useFakeTimers();
    try {
      const rateLimitError = new OpenAI.RateLimitError(429, {}, 'rate limit', headersLike);
      const fn = jest
        .fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue('成功');

      const resultPromise = withLLMRetry(fn);
      // タイマーを全て消化して microtask も flush する
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('成功');
      expect(fn).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('最大リトライ回数を超えると最後のエラーで reject する', async () => {
    jest.useFakeTimers();
    try {
      const rateLimitError = new OpenAI.RateLimitError(429, {}, 'rate limit', headersLike);
      // maxRetries が 3 なので 4 回呼ばれる（初回 + 3 回リトライ）
      const fn = jest.fn().mockRejectedValue(rateLimitError);

      const resultPromise = withLLMRetry(fn);
      // 先に catch を登録してから timer を進める（unhandled rejection を防ぐ）
      const caughtPromise = resultPromise.catch((err: unknown) => err);
      // タイマーを全て消化して全リトライを完了させる
      await jest.runAllTimersAsync();

      const caughtError = await caughtPromise;
      expect(caughtError).toBeInstanceOf(OpenAI.RateLimitError);
      expect(fn).toHaveBeenCalledTimes(4);
    } finally {
      jest.useRealTimers();
    }
  });
});
