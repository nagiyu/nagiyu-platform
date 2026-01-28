/**
 * useAPIRequest Hook Tests
 *
 * React Testing Library を使用したカスタムフックのテスト
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useAPIRequest } from '../../src/hooks/useAPIRequest';
import { APIError } from '@nagiyu/common';

// グローバル fetch をモック
const originalFetch = global.fetch;

describe('useAPIRequest', () => {
  beforeEach(() => {
    // 各テストの前にfetchをモック化
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    // テスト終了後に元のfetchを復元
    global.fetch = originalFetch;
  });

  describe('初期状態', () => {
    it('初期状態が正しく設定されている', () => {
      const { result } = renderHook(() => useAPIRequest());

      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('execute関数', () => {
    it('正常系: データ取得が成功する', async () => {
      const mockData = { id: 1, name: 'Test User' };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const { result } = renderHook(() => useAPIRequest<typeof mockData>());

      expect(result.current.loading).toBe(false);

      // execute を実行
      let response: typeof mockData | null = null;
      await act(async () => {
        response = await result.current.execute('/api/user');
      });

      // データが正しく設定されている
      expect(result.current.data).toEqual(mockData);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(response).toEqual(mockData);

      // fetch が正しく呼ばれた
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/user',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('異常系: エラー時の状態更新が正しく行われる', async () => {
      const errorResponse = {
        error: 'NOT_FOUND',
        message: 'データが見つかりませんでした',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => errorResponse,
      });

      const { result } = renderHook(() => useAPIRequest());

      let response: unknown = null;
      await act(async () => {
        response = await result.current.execute('/api/not-found');
      });

      // エラーが設定されている
      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeInstanceOf(APIError);
      expect(result.current.error?.status).toBe(404);
      expect(response).toBeNull();
    });

    it('ローディング状態が正しく管理される', async () => {
      const mockData = { id: 1 };

      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: async () => mockData,
              });
            }, 100);
          })
      );

      const { result } = renderHook(() => useAPIRequest<typeof mockData>());

      // 実行前はloading=false
      expect(result.current.loading).toBe(false);

      // execute を実行
      act(() => {
        void result.current.execute('/api/data');
      });

      // 実行中はloading=true
      expect(result.current.loading).toBe(true);

      // 完了を待つ
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 完了後はloading=false
      expect(result.current.data).toEqual(mockData);
    });
  });

  describe('コールバック', () => {
    it('成功時にonSuccessコールバックが呼ばれる', async () => {
      const mockData = { id: 1, name: 'Test User' };
      const onSuccess = jest.fn();

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const { result } = renderHook(() => useAPIRequest<typeof mockData>({ onSuccess }));

      await act(async () => {
        await result.current.execute('/api/user');
      });

      expect(onSuccess).toHaveBeenCalledWith(mockData);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('エラー時にonErrorコールバックが呼ばれる', async () => {
      const errorResponse = {
        error: 'SERVER_ERROR',
        message: 'サーバーエラーが発生しました',
      };
      const onError = jest.fn();

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => errorResponse,
      });

      const { result } = renderHook(() => useAPIRequest({ onError }));

      await act(async () => {
        // Disable retry to avoid retry logic
        await result.current.execute('/api/error', {
          retry: { maxRetries: 0 },
        });
      });

      expect(onError).toHaveBeenCalledWith(expect.any(APIError));
      expect(onError).toHaveBeenCalledTimes(1);

      const errorArg = onError.mock.calls[0][0] as APIError;
      expect(errorArg.status).toBe(500);
    });

    it('コールバックが設定されていない場合でも正常に動作する', async () => {
      const mockData = { id: 1 };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const { result } = renderHook(() => useAPIRequest<typeof mockData>());

      await act(async () => {
        await result.current.execute('/api/user');
      });

      expect(result.current.data).toEqual(mockData);
    });
  });

  describe('reset関数', () => {
    it('状態をリセットできる', async () => {
      const mockData = { id: 1 };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const { result } = renderHook(() => useAPIRequest<typeof mockData>());

      // データを取得
      await act(async () => {
        await result.current.execute('/api/user');
      });

      expect(result.current.data).toEqual(mockData);

      // リセット
      act(() => {
        result.current.reset();
      });

      // 初期状態に戻る
      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('retry関数', () => {
    it('最後のリクエストを再試行できる', async () => {
      const mockData = { id: 1 };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const { result } = renderHook(() => useAPIRequest<typeof mockData>());

      // 初回リクエスト
      await act(async () => {
        await result.current.execute('/api/user');
      });

      expect(result.current.data).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // リトライ
      await act(async () => {
        await result.current.retry();
      });

      // 同じURLで再度fetchが呼ばれる
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.current.data).toEqual(mockData);
    });

    it('リクエスト履歴がない場合は警告を出力する', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const { result } = renderHook(() => useAPIRequest());

      // リクエスト実行前にリトライ
      let response: unknown = null;
      await act(async () => {
        response = await result.current.retry();
      });

      expect(response).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith('No previous request to retry');

      consoleWarnSpy.mockRestore();
    });

    it('エラー後のリトライでも正しく動作する', async () => {
      const errorResponse = {
        error: 'SERVER_ERROR',
        message: 'サーバーエラーが発生しました',
      };
      const mockData = { id: 1 };

      // 1回目: エラー
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => errorResponse,
      });

      const { result } = renderHook(() => useAPIRequest<typeof mockData>());

      await act(async () => {
        await result.current.execute('/api/user');
      });

      expect(result.current.error).toBeInstanceOf(APIError);

      // 2回目: 成功
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      await act(async () => {
        await result.current.retry();
      });

      expect(result.current.data).toEqual(mockData);
      expect(result.current.error).toBeNull();
    });
  });

  describe('リクエストオプション', () => {
    it('カスタムヘッダーを渡すことができる', async () => {
      const mockData = { id: 1 };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const { result } = renderHook(() => useAPIRequest<typeof mockData>());

      await act(async () => {
        await result.current.execute('/api/user', {
          headers: {
            Authorization: 'Bearer token123',
          },
        });
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/user',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer token123',
          },
        })
      );
    });

    it('POSTメソッドとボディを渡すことができる', async () => {
      const mockData = { success: true };
      const requestBody = { name: 'New User' };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const { result } = renderHook(() => useAPIRequest<typeof mockData>());

      await act(async () => {
        await result.current.execute('/api/user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/user',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestBody),
        })
      );
    });
  });
});
