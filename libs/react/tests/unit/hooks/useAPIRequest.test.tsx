/**
 * useAPIRequest Hook テスト
 */

import { renderHook, act } from '@testing-library/react';
import { useAPIRequest } from '../../../src/hooks/useAPIRequest.js';
import { apiRequest, APIError } from '@nagiyu/common';

// Mock @nagiyu/common
jest.mock('@nagiyu/common', () => ({
  apiRequest: jest.fn(),
  APIError: class APIError extends Error {
    constructor(
      public readonly status: number,
      public readonly errorInfo: { type: string; message: string },
      message: string
    ) {
      super(message);
      this.name = 'APIError';
    }
  },
}));

const mockApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('useAPIRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('初期状態', () => {
    it('初期状態は data: null, loading: false, error: null である', () => {
      const { result } = renderHook(() => useAPIRequest());

      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('execute', () => {
    it('データ取得成功時に data を設定する', async () => {
      const mockData = { id: 1, name: 'Test' };
      mockApiRequest.mockResolvedValueOnce(mockData);

      const { result } = renderHook(() => useAPIRequest<typeof mockData>());

      // リクエスト実行
      let data: typeof mockData | null = null;
      await act(async () => {
        data = await result.current.execute('/api/test');
      });

      // 結果を確認
      expect(result.current.data).toEqual(mockData);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(data).toEqual(mockData);

      // apiRequest が正しい引数で呼ばれたことを確認
      expect(mockApiRequest).toHaveBeenCalledWith('/api/test', undefined);
    });

    it('データ取得成功時に onSuccess コールバックを呼び出す', async () => {
      const mockData = { id: 1, name: 'Test' };
      const onSuccess = jest.fn();
      mockApiRequest.mockResolvedValueOnce(mockData);

      const { result } = renderHook(() => useAPIRequest<typeof mockData>({ onSuccess }));

      await act(async () => {
        await result.current.execute('/api/test');
      });

      expect(onSuccess).toHaveBeenCalledWith(mockData);
    });

    it('エラー発生時に error を設定する', async () => {
      const mockError = new APIError(
        500,
        {
          type: 'error' as const,
          message: 'サーバーエラーが発生しました',
        },
        'サーバーエラーが発生しました'
      );
      mockApiRequest.mockRejectedValueOnce(mockError);

      const { result } = renderHook(() => useAPIRequest());

      await act(async () => {
        await result.current.execute('/api/test');
      });

      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toEqual(mockError);
    });

    it('エラー発生時に onError コールバックを呼び出す', async () => {
      const mockError = new APIError(
        500,
        {
          type: 'error' as const,
          message: 'サーバーエラーが発生しました',
        },
        'サーバーエラーが発生しました'
      );
      const onError = jest.fn();
      mockApiRequest.mockRejectedValueOnce(mockError);

      const { result } = renderHook(() => useAPIRequest({ onError }));

      await act(async () => {
        await result.current.execute('/api/test');
      });

      expect(onError).toHaveBeenCalledWith(mockError);
    });

    it('リクエストオプションを apiRequest に渡す', async () => {
      const mockData = { id: 1 };
      mockApiRequest.mockResolvedValueOnce(mockData);

      const { result } = renderHook(() => useAPIRequest());

      const options = {
        method: 'POST' as const,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' }),
      };

      await act(async () => {
        await result.current.execute('/api/test', options);
      });

      expect(mockApiRequest).toHaveBeenCalledWith('/api/test', options);
    });
  });

  describe('reset', () => {
    it('状態をリセットする', async () => {
      const mockData = { id: 1 };
      mockApiRequest.mockResolvedValueOnce(mockData);

      const { result } = renderHook(() => useAPIRequest<typeof mockData>());

      // データを取得
      await act(async () => {
        await result.current.execute('/api/test');
      });

      expect(result.current.data).toEqual(mockData);

      // リセット
      act(() => {
        result.current.reset();
      });

      // 初期状態に戻ることを確認
      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('最後のリクエスト情報もクリアされる', async () => {
      const mockData = { id: 1 };
      mockApiRequest.mockResolvedValueOnce(mockData);

      const { result } = renderHook(() => useAPIRequest<typeof mockData>());

      await act(async () => {
        await result.current.execute('/api/test');
      });

      act(() => {
        result.current.reset();
      });

      // retry を呼んでも何も起こらない（警告のみ）
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      let retryResult: typeof mockData | null = null;
      await act(async () => {
        retryResult = await result.current.retry();
      });

      expect(retryResult).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith('No previous request to retry');

      consoleWarnSpy.mockRestore();
    });
  });

  describe('retry', () => {
    it('最後のリクエストを再実行する', async () => {
      const mockData1 = { id: 1, name: 'First' };
      const mockData2 = { id: 2, name: 'Second' };

      mockApiRequest.mockResolvedValueOnce(mockData1).mockResolvedValueOnce(mockData2);

      const { result } = renderHook(() => useAPIRequest<typeof mockData1>());

      // 最初のリクエスト
      await act(async () => {
        await result.current.execute('/api/test');
      });

      expect(result.current.data).toEqual(mockData1);

      // リトライ
      await act(async () => {
        await result.current.retry();
      });

      expect(result.current.data).toEqual(mockData2);

      // apiRequest が2回呼ばれたことを確認
      expect(mockApiRequest).toHaveBeenCalledTimes(2);
      expect(mockApiRequest).toHaveBeenNthCalledWith(1, '/api/test', undefined);
      expect(mockApiRequest).toHaveBeenNthCalledWith(2, '/api/test', undefined);
    });

    it('リクエストオプションも再利用する', async () => {
      const mockData = { id: 1 };
      mockApiRequest.mockResolvedValue(mockData);

      const { result } = renderHook(() => useAPIRequest<typeof mockData>());

      const options = {
        method: 'POST' as const,
        body: JSON.stringify({ test: 'data' }),
      };

      // オプション付きでリクエスト
      await act(async () => {
        await result.current.execute('/api/test', options);
      });

      // リトライ
      await act(async () => {
        await result.current.retry();
      });

      // 両方のリクエストで同じオプションが使われることを確認
      expect(mockApiRequest).toHaveBeenCalledTimes(2);
      expect(mockApiRequest).toHaveBeenNthCalledWith(1, '/api/test', options);
      expect(mockApiRequest).toHaveBeenNthCalledWith(2, '/api/test', options);
    });

    it('前回のリクエストがない場合は null を返す', async () => {
      const { result } = renderHook(() => useAPIRequest());

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      let retryResult = null;
      await act(async () => {
        retryResult = await result.current.retry();
      });

      expect(retryResult).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith('No previous request to retry');

      consoleWarnSpy.mockRestore();
    });

    it('エラー後にリトライできる', async () => {
      const mockError = new APIError(500, { type: 'error' as const, message: 'エラー' }, 'エラー');
      const mockData = { id: 1 };

      mockApiRequest.mockRejectedValueOnce(mockError).mockResolvedValueOnce(mockData);

      const { result } = renderHook(() => useAPIRequest<typeof mockData>());

      // エラーになるリクエスト
      await act(async () => {
        await result.current.execute('/api/test');
      });

      expect(result.current.error).toEqual(mockError);

      // リトライして成功
      await act(async () => {
        await result.current.retry();
      });

      expect(result.current.data).toEqual(mockData);
      expect(result.current.error).toBeNull();
    });
  });
});
