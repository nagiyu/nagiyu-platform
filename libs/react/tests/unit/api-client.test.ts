/**
 * ApiClient のユニットテスト
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ApiClient, APIError } from '../../src/api-client';

// global.fetch をモック化
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient();
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('baseUrl なしで作成できる', () => {
      const c = new ApiClient();
      expect(c).toBeInstanceOf(ApiClient);
    });

    it('baseUrl ありで作成できる', () => {
      const c = new ApiClient('/api');
      expect(c).toBeInstanceOf(ApiClient);
    });

    it('デフォルトオプションありで作成できる', () => {
      const c = new ApiClient('/api', {
        headers: { 'X-Custom': 'value' },
      });
      expect(c).toBeInstanceOf(ApiClient);
    });
  });

  describe('get', () => {
    it('正常系: GET リクエストが成功する', async () => {
      const mockData = { id: '1', name: 'Test' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      } as Response);

      const result = await client.get('/test');

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith('/test', expect.objectContaining({ method: 'GET' }));
    });

    it('正常系: baseUrl が結合される', async () => {
      const clientWithBase = new ApiClient('/api');
      const mockData = { id: '1' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      } as Response);

      await clientWithBase.get('/users');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('異常系: 404エラーでAPIErrorをスロー', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'NOT_FOUND', message: 'リソースが見つかりませんでした' }),
      } as Response);

      await expect(client.get('/test')).rejects.toThrow(APIError);
    });

    it('異常系: 500エラーでAPIErrorをスロー', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'INTERNAL_ERROR', message: 'サーバーエラー' }),
      } as Response);

      await expect(client.get('/test')).rejects.toThrow(APIError);
    });
  });

  describe('post', () => {
    it('正常系: POST リクエストが成功する', async () => {
      const mockData = { id: '1', name: 'Created' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      } as Response);

      const body = { name: 'Test' };
      const result = await client.post('/test', body);

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        '/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('正常系: カスタムヘッダーが追加される', async () => {
      const mockData = { id: '1' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      } as Response);

      await client.post('/test', {}, { headers: { 'X-Custom': 'value' } });

      expect(mockFetch).toHaveBeenCalledWith(
        '/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Custom': 'value',
          }),
        })
      );
    });
  });

  describe('put', () => {
    it('正常系: PUT リクエストが成功する', async () => {
      const mockData = { id: '1', name: 'Updated' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      } as Response);

      const body = { name: 'Updated' };
      const result = await client.put('/test/1', body);

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        '/test/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(body),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('delete', () => {
    it('正常系: DELETE リクエストが成功する', async () => {
      const mockData = { success: true };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      } as Response);

      const result = await client.delete('/test/1');

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        '/test/1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('リトライ', () => {
    it('5xxエラーでリトライし、成功する', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'INTERNAL_ERROR', message: 'サーバーエラー' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        } as Response);

      const result = await client.get('/test', { retry: { maxRetries: 1, initialDelay: 10 } });

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('リトライ回数を超えるとエラーをスロー', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'INTERNAL_ERROR', message: 'サーバーエラー' }),
      } as Response);

      await expect(
        client.get('/test', { retry: { maxRetries: 2, initialDelay: 10 } })
      ).rejects.toThrow(APIError);

      // 初回 + リトライ2回 = 3回
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('4xxエラーではリトライしない', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'NOT_FOUND', message: 'Not found' }),
      } as Response);

      await expect(
        client.get('/test', { retry: { maxRetries: 2, initialDelay: 10 } })
      ).rejects.toThrow(APIError);

      // リトライされないので1回のみ
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('タイムアウト', () => {
    it('タイムアウト時にエラーをスロー', async () => {
      // AbortController の abort が呼ばれたときにエラーをスローするようにモック
      mockFetch.mockImplementationOnce(() => {
        const abortError = new Error('The operation was aborted');
        abortError.name = 'AbortError';
        return Promise.reject(abortError);
      });

      // リトライしないように設定
      await expect(
        client.get('/test', { timeout: 100, retry: { maxRetries: 0 } })
      ).rejects.toThrow();
    }, 10000);
  });

  describe('デフォルトオプション', () => {
    it('デフォルトヘッダーがすべてのリクエストに適用される', async () => {
      const clientWithDefaults = new ApiClient('/api', {
        headers: { 'X-API-Key': 'secret' },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      await clientWithDefaults.get('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'secret',
          }),
        })
      );
    });

    it('リクエスト固有のヘッダーがデフォルトヘッダーをオーバーライド', async () => {
      const clientWithDefaults = new ApiClient('/api', {
        headers: { 'X-API-Key': 'default' },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      await clientWithDefaults.get('/test', {
        headers: { 'X-API-Key': 'override' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'override',
          }),
        })
      );
    });
  });
});
