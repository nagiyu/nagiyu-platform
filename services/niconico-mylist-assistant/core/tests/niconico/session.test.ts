import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { validateUserSession } from '../../src/niconico/session';

describe('validateUserSession', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('有効なセッション（200レスポンス）', () => {
    it('ステータス200の場合は valid を返す', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 200,
        headers: new Headers(),
      } as unknown as Response);

      const result = await validateUserSession('valid_session_token');

      expect(result).toBe('valid');
    });

    it('正しいCookieヘッダーでリクエストを送信する', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 200,
        headers: new Headers(),
      } as unknown as Response);

      await validateUserSession('my_session_value');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://www.nicovideo.jp/my/mylist',
        expect.objectContaining({
          method: 'GET',
          redirect: 'manual',
          headers: expect.objectContaining({
            Cookie: 'user_session=my_session_value',
          }),
        })
      );
    });
  });

  describe('無効なセッション（302リダイレクト）', () => {
    it('302かつLocationがaccount.nicovideo.jpへのリダイレクトの場合は invalid を返す', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 302,
        headers: new Headers({
          Location: 'https://account.nicovideo.jp/login?site=niconico&next_url=%2Fmy%2Fmylist',
        }),
      } as unknown as Response);

      const result = await validateUserSession('expired_session_token');

      expect(result).toBe('invalid');
    });

    it('302かつLocationにaccount.nicovideo.jpが含まれる場合は invalid を返す', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 302,
        headers: new Headers({
          Location: 'https://account.nicovideo.jp/login',
        }),
      } as unknown as Response);

      const result = await validateUserSession('another_expired_token');

      expect(result).toBe('invalid');
    });

    it('302だがLoginページ以外へのリダイレクトの場合は unknown を返す', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 302,
        headers: new Headers({
          Location: 'https://www.nicovideo.jp/watch/sm9',
        }),
      } as unknown as Response);

      const result = await validateUserSession('some_session_token');

      expect(result).toBe('unknown');
    });

    it('302かつLocationヘッダーが存在しない場合は unknown を返す', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 302,
        headers: new Headers(),
      } as unknown as Response);

      const result = await validateUserSession('some_session_token');

      expect(result).toBe('unknown');
    });
  });

  describe('判定不能（unknown）', () => {
    it('5xxエラーの場合は unknown を返す', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 500,
        headers: new Headers(),
      } as unknown as Response);

      const result = await validateUserSession('session_token');

      expect(result).toBe('unknown');
    });

    it('503エラーの場合は unknown を返す', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 503,
        headers: new Headers(),
      } as unknown as Response);

      const result = await validateUserSession('session_token');

      expect(result).toBe('unknown');
    });

    it('403エラーの場合は unknown を返す', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 403,
        headers: new Headers(),
      } as unknown as Response);

      const result = await validateUserSession('session_token');

      expect(result).toBe('unknown');
    });

    it('ネットワークエラーの場合は unknown を返す（例外をスローしない）', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const result = await validateUserSession('session_token');

      expect(result).toBe('unknown');
    });

    it('DNS解決失敗の場合は unknown を返す（例外をスローしない）', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await validateUserSession('session_token');

      expect(result).toBe('unknown');
    });
  });

  describe('リクエスト形式', () => {
    it('redirect: manual でリクエストする（自動リダイレクトしない）', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 200,
        headers: new Headers(),
      } as unknown as Response);

      await validateUserSession('session_token');

      const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(callArgs[1].redirect).toBe('manual');
    });

    it('ブラウザ風User-Agentをリクエストに含める', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 200,
        headers: new Headers(),
      } as unknown as Response);

      await validateUserSession('session_token');

      const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = callArgs[1].headers as Record<string, string>;
      expect(headers['User-Agent']).toContain('Mozilla/5.0');
    });
  });
});
