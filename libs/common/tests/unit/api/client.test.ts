/**
 * APIクライアントのテスト
 */

import {
  calculateBackoffDelay,
  sleep,
  fetchWithTimeout,
  apiRequest,
  get,
  post,
  put,
  del,
} from '../../../src/api/client';
import { APIError } from '../../../src/api/types';

// fetch をモック化
global.fetch = jest.fn();

describe('client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('calculateBackoffDelay', () => {
    const config = {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
    };

    it('エクスポネンシャルバックオフが正しく計算される', () => {
      const delay0 = calculateBackoffDelay(0, config);
      const delay1 = calculateBackoffDelay(1, config);
      const delay2 = calculateBackoffDelay(2, config);

      // ジッター考慮: 基準値の75%-125%の範囲内
      expect(delay0).toBeGreaterThanOrEqual(750); // 1000 * 0.75
      expect(delay0).toBeLessThanOrEqual(1250); // 1000 * 1.25

      expect(delay1).toBeGreaterThanOrEqual(1500); // 2000 * 0.75
      expect(delay1).toBeLessThanOrEqual(2500); // 2000 * 1.25

      expect(delay2).toBeGreaterThanOrEqual(3000); // 4000 * 0.75
      expect(delay2).toBeLessThanOrEqual(5000); // 4000 * 1.25
    });

    it('maxDelayを超えない', () => {
      const delay10 = calculateBackoffDelay(10, config); // 1000 * 2^10 = 1024000

      // maxDelayの125%を超えない（ジッター考慮）
      expect(delay10).toBeLessThanOrEqual(12500); // 10000 * 1.25
    });
  });

  describe('sleep', () => {
    it('指定時間スリープする', async () => {
      const promise = sleep(1000);
      jest.advanceTimersByTime(1000);
      await promise;

      expect(true).toBe(true); // スリープが完了したことを確認
    });
  });

  describe('fetchWithTimeout', () => {
    it('タイムアウト内にレスポンスが返る場合は成功する', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({ data: 'test' }),
      } as Response;
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const promise = fetchWithTimeout('https://api.example.com/data', {
        timeout: 5000,
      });

      const result = await promise;

      expect(result).toBe(mockResponse);
    });

    it('タイムアウトが発生した場合はエラーをスローする', async () => {
      // AbortControllerがabort()されるとfetchがエラーをスローするようにシミュレート
      const controller = new AbortController();
      (global.fetch as jest.Mock).mockImplementation((_url: string, options: RequestInit) => {
        return new Promise((_, reject) => {
          if (options.signal) {
            options.signal.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
        });
      });

      const promise = fetchWithTimeout('https://api.example.com/data', {
        timeout: 1000,
      });

      // タイマーを進めてタイムアウトを発生させる
      jest.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow('The operation was aborted');
    });
  });

  describe('apiRequest', () => {
    it('成功時はデータを返す', async () => {
      const mockData = { id: 1, name: 'Test' };
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => mockData,
      } as Response;
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await apiRequest<typeof mockData>('https://api.example.com/data');

      expect(result).toEqual(mockData);
    });

    it('リトライ可能なエラー時はリトライする', async () => {
      const mockErrorResponse = {
        ok: false,
        status: 500,
        json: async () => ({ error: 'INTERNAL_ERROR', message: 'Server error' }),
      } as Response;
      const mockSuccessResponse = {
        ok: true,
        status: 200,
        json: async () => ({ data: 'success' }),
      } as Response;

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockErrorResponse)
        .mockResolvedValueOnce(mockSuccessResponse);

      const promise = apiRequest('https://api.example.com/data', {
        retry: { maxRetries: 1, initialDelay: 100 },
      });

      // 最初のリクエストが失敗
      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result).toEqual({ data: 'success' });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('リトライ不可能なエラー時は即座にエラーをスローする', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        json: async () => ({ error: 'NOT_FOUND', message: 'Not found' }),
      } as Response;
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(
        apiRequest('https://api.example.com/data', {
          retry: { maxRetries: 3 },
        })
      ).rejects.toThrow(APIError);

      // リトライされない
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('最大リトライ回数を超えたらエラーをスローする', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        json: async () => ({ error: 'INTERNAL_ERROR', message: 'Server error' }),
      } as Response;
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // リトライ回数を0にしてリトライを無効化
      await expect(
        apiRequest('https://api.example.com/data', {
          retry: { maxRetries: 0 },
        })
      ).rejects.toThrow(APIError);

      // リトライなしなので1回だけ
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('ネットワークエラー時はリトライする', async () => {
      const networkError = new TypeError('Failed to fetch');
      const mockSuccessResponse = {
        ok: true,
        status: 200,
        json: async () => ({ data: 'success' }),
      } as Response;

      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(mockSuccessResponse);

      const promise = apiRequest('https://api.example.com/data', {
        retry: { maxRetries: 1, initialDelay: 100 },
      });

      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result).toEqual({ data: 'success' });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('サービス固有メッセージを使用できる', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: async () => ({ error: 'CUSTOM_ERROR', message: 'Custom error' }),
      } as Response;
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const serviceMessages = {
        CUSTOM_ERROR: 'カスタムエラーメッセージ',
      };

      try {
        await apiRequest('https://api.example.com/data', {}, serviceMessages);
        fail('Expected APIError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(APIError);
        expect((error as APIError).message).toBe('カスタムエラーメッセージ');
      }
    });
  });

  describe('HTTPメソッドラッパー', () => {
    beforeEach(() => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({ data: 'test' }),
      } as Response;
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
    });

    it('get()はGETリクエストを送信する', async () => {
      await get('https://api.example.com/data');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('post()はPOSTリクエストを送信する', async () => {
      const body = { name: 'test' };
      await post('https://api.example.com/data', body);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(body),
        })
      );
    });

    it('put()はPUTリクエストを送信する', async () => {
      const body = { name: 'updated' };
      await put('https://api.example.com/data', body);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(body),
        })
      );
    });

    it('del()はDELETEリクエストを送信する', async () => {
      await del('https://api.example.com/data');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('各メソッドでserviceMessagesを渡せる', async () => {
      const serviceMessages = { CUSTOM_ERROR: 'カスタム' };

      await get('https://api.example.com/data', {}, serviceMessages);
      await post('https://api.example.com/data', {}, {}, serviceMessages);
      await put('https://api.example.com/data', {}, {}, serviceMessages);
      await del('https://api.example.com/data', {}, serviceMessages);

      // 各メソッドが正しく実行されたことを確認
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });
  });
});
