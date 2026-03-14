import { ERROR_MESSAGES, generateVapidKeys } from '@/lib/vapid';

describe('vapid', () => {
  afterEach(() => {
    delete (globalThis as { fetch?: typeof fetch }).fetch;
    jest.restoreAllMocks();
  });

  describe('generateVapidKeys', () => {
    it('正常系: APIが返した公開鍵と秘密鍵を返す', async () => {
      const json = jest.fn().mockResolvedValue({
        publicKey: 'public-key',
        privateKey: 'private-key',
      });
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json,
      } as unknown as Response);
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await expect(generateVapidKeys()).resolves.toEqual({
        publicKey: 'public-key',
        privateKey: 'private-key',
      });
      expect(mockFetch).toHaveBeenCalledWith('/api/vapid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('異常系: APIステータスが失敗の場合はエラーを返す', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
      } as unknown as Response);
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await expect(generateVapidKeys()).rejects.toThrow(ERROR_MESSAGES.GENERATE_FAILED);
    });

    it('異常系: APIレスポンス形式が不正な場合はエラーを返す', async () => {
      const json = jest.fn().mockResolvedValue({
        publicKey: 'public-key',
      });
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json,
      } as unknown as Response);
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await expect(generateVapidKeys()).rejects.toThrow(ERROR_MESSAGES.INVALID_RESPONSE);
    });
  });
});
