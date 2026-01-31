/**
 * Unit tests for validateCallbackUrl function
 */

import { validateCallbackUrl, DEFAULT_CALLBACK_URL } from '../../../src/lib/validate-callback-url';

describe('validateCallbackUrl', () => {
  const baseUrl = 'https://dev-auth.nagiyu.com';

  describe('同じドメインへのリダイレクト', () => {
    it('ベース URL と同じドメインの URL を許可する', () => {
      const url = 'https://dev-auth.nagiyu.com/dashboard';
      expect(validateCallbackUrl(url, baseUrl)).toBe(url);
    });

    it('ベース URL と完全に一致する URL を許可する', () => {
      expect(validateCallbackUrl(baseUrl, baseUrl)).toBe(baseUrl);
    });
  });

  describe('相対パスへのリダイレクト', () => {
    it('/ で始まる相対パスを許可する', () => {
      const url = '/dashboard';
      expect(validateCallbackUrl(url, baseUrl)).toBe(url);
    });

    it('クエリパラメータ付きの相対パスを許可する', () => {
      const url = '/dashboard?tab=overview';
      expect(validateCallbackUrl(url, baseUrl)).toBe(url);
    });

    it('深いパスの相対 URL を許可する', () => {
      const url = '/users/123/edit';
      expect(validateCallbackUrl(url, baseUrl)).toBe(url);
    });
  });

  describe('*.nagiyu.com ドメインへのリダイレクト', () => {
    it('dev-niconico-mylist-assistant.nagiyu.com を許可する', () => {
      const url = 'https://dev-niconico-mylist-assistant.nagiyu.com/';
      expect(validateCallbackUrl(url, baseUrl)).toBe(url);
    });

    it('パス付きの nagiyu.com サブドメインを許可する', () => {
      const url = 'https://dev-stock-tracker.nagiyu.com/dashboard';
      expect(validateCallbackUrl(url, baseUrl)).toBe(url);
    });

    it('http プロトコルの nagiyu.com サブドメインを許可する（開発環境）', () => {
      const url = 'http://localhost.nagiyu.com:3000/';
      expect(validateCallbackUrl(url, baseUrl)).toBe(url);
    });

    it('クエリパラメータ付きの nagiyu.com URL を許可する', () => {
      const url = 'https://dev-tools.nagiyu.com/?source=auth';
      expect(validateCallbackUrl(url, baseUrl)).toBe(url);
    });
  });

  describe('外部 URL の拒否（オープンリダイレクト対策）', () => {
    it('google.com へのリダイレクトを拒否する', () => {
      const url = 'https://google.com';
      expect(validateCallbackUrl(url, baseUrl)).toBe(DEFAULT_CALLBACK_URL);
    });

    it('evil.com へのリダイレクトを拒否する', () => {
      const url = 'https://evil.com';
      expect(validateCallbackUrl(url, baseUrl)).toBe(DEFAULT_CALLBACK_URL);
    });

    it('nagiyu.com.attacker.com のような URL を拒否する', () => {
      const url = 'https://nagiyu.com.attacker.com/';
      expect(validateCallbackUrl(url, baseUrl)).toBe(DEFAULT_CALLBACK_URL);
    });

    it('evil.nagiyu.com.attacker.com のような URL を拒否する', () => {
      const url = 'https://evil.nagiyu.com.attacker.com/';
      expect(validateCallbackUrl(url, baseUrl)).toBe(DEFAULT_CALLBACK_URL);
    });

    it('データ URI を拒否する', () => {
      const url = 'data:text/html,<script>alert("XSS")</script>';
      expect(validateCallbackUrl(url, baseUrl)).toBe(DEFAULT_CALLBACK_URL);
    });

    it('javascript: プロトコルを拒否する', () => {
      const url = 'javascript:alert("XSS")';
      expect(validateCallbackUrl(url, baseUrl)).toBe(DEFAULT_CALLBACK_URL);
    });

    it('// で始まるプロトコル相対 URL を拒否する（外部ドメインの場合）', () => {
      const url = '//evil.com/path';
      expect(validateCallbackUrl(url, baseUrl)).toBe(DEFAULT_CALLBACK_URL);
    });
  });

  describe('エッジケース', () => {
    it('空文字列の場合はデフォルト URL を返す', () => {
      expect(validateCallbackUrl('', baseUrl)).toBe(DEFAULT_CALLBACK_URL);
    });

    it('nagiyu.com ルートドメイン（サブドメインなし）は拒否する', () => {
      const url = 'https://nagiyu.com/';
      expect(validateCallbackUrl(url, baseUrl)).toBe(DEFAULT_CALLBACK_URL);
    });
  });
});
