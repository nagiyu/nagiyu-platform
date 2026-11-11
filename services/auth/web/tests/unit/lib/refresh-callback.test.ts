/**
 * resolveRefreshCallbackUrl のユニットテスト
 *
 * auth の redirect コールバックと同じ許可基準を検証:
 *   - 同一オリジン（baseUrl で始まる URL）は許可
 *   - auth 内の相対パスは絶対 URL にして許可
 *   - *.nagiyu.com 配下の URL は許可
 *   - 外部 URL は baseUrl にフォールバック
 *   - 空 / 未指定のフォールバック
 */

import { resolveRefreshCallbackUrl } from '../../../src/lib/refresh-callback';

const BASE_URL = 'https://auth.nagiyu.com';

describe('resolveRefreshCallbackUrl', () => {
  describe('同一オリジン（baseUrl で始まる URL）', () => {
    it('baseUrl そのものは許可する', () => {
      const result = resolveRefreshCallbackUrl(BASE_URL, BASE_URL);
      expect(result).toBe(BASE_URL);
    });

    it('baseUrl で始まるパス付き URL は許可する', () => {
      const url = `${BASE_URL}/dashboard`;
      const result = resolveRefreshCallbackUrl(url, BASE_URL);
      expect(result).toBe(url);
    });

    it('baseUrl で始まるネストされたパスも許可する', () => {
      const url = `${BASE_URL}/dashboard/users?page=2`;
      const result = resolveRefreshCallbackUrl(url, BASE_URL);
      expect(result).toBe(url);
    });
  });

  describe('*.nagiyu.com 配下の URL', () => {
    it('https://admin.nagiyu.com は許可する', () => {
      const url = 'https://admin.nagiyu.com/';
      const result = resolveRefreshCallbackUrl(url, BASE_URL);
      expect(result).toBe(url);
    });

    it('https://stock-tracker.nagiyu.com のパス付き URL は許可する', () => {
      const url = 'https://stock-tracker.nagiyu.com/portfolio';
      const result = resolveRefreshCallbackUrl(url, BASE_URL);
      expect(result).toBe(url);
    });

    it('http スキームの *.nagiyu.com も許可する', () => {
      const url = 'http://admin.dev.nagiyu.com/';
      const result = resolveRefreshCallbackUrl(url, BASE_URL);
      expect(result).toBe(url);
    });

    it('*.dev.nagiyu.com（dev 環境のサブドメイン）も許可する', () => {
      const url = 'https://stock-tracker.dev.nagiyu.com/';
      const result = resolveRefreshCallbackUrl(url, BASE_URL);
      expect(result).toBe(url);
    });
  });

  describe('外部 URL（フォールバック）', () => {
    it('全く別のドメインは baseUrl にフォールバックする', () => {
      const result = resolveRefreshCallbackUrl('https://evil.example.com/', BASE_URL);
      expect(result).toBe(BASE_URL);
    });

    it('nagiyu.com が含まれていても subdomain でなければフォールバックする', () => {
      // 例: nagiyu.com.evil.example.com
      const result = resolveRefreshCallbackUrl('https://nagiyu.com.attacker.com/', BASE_URL);
      expect(result).toBe(BASE_URL);
    });

    it('javascript: スキームはフォールバックする', () => {
      const result = resolveRefreshCallbackUrl('javascript:alert(1)', BASE_URL);
      expect(result).toBe(BASE_URL);
    });

    it('data: スキームはフォールバックする', () => {
      const result = resolveRefreshCallbackUrl('data:text/html,<h1>XSS</h1>', BASE_URL);
      expect(result).toBe(BASE_URL);
    });

    it.each(['//evil.com', '/\\evil.com', '/\t/evil.com', '/\n/evil.com'])(
      'オリジンを変えうる相対パス %j はフォールバックする',
      (raw) => {
        expect(resolveRefreshCallbackUrl(raw, BASE_URL)).toBe(BASE_URL);
      }
    );
  });

  describe('auth 内の相対パス', () => {
    it('相対パスは絶対 URL にして返す', () => {
      expect(resolveRefreshCallbackUrl('/dashboard/users', BASE_URL)).toBe(
        `${BASE_URL}/dashboard/users`
      );
    });

    it('相対パスのクエリを残す', () => {
      expect(resolveRefreshCallbackUrl('/plans?plan=pro', BASE_URL)).toBe(
        `${BASE_URL}/plans?plan=pro`
      );
    });
  });

  describe('オープンリダイレクト対策（ホスト名の途中に nagiyu.com を含む攻撃 URL）', () => {
    it('https://auth.nagiyu.com.evil.com はフォールバックする', () => {
      const result = resolveRefreshCallbackUrl('https://auth.nagiyu.com.evil.com/phish', BASE_URL);
      expect(result).toBe(BASE_URL);
    });

    it('https://evil.nagiyu.com.attacker.com はフォールバックする', () => {
      const result = resolveRefreshCallbackUrl(
        'https://evil.nagiyu.com.attacker.com/steal',
        BASE_URL
      );
      expect(result).toBe(BASE_URL);
    });

    it('https://x.nagiyu.como（末尾に別 TLD が続く）はフォールバックする', () => {
      const result = resolveRefreshCallbackUrl('https://x.nagiyu.como/', BASE_URL);
      expect(result).toBe(BASE_URL);
    });

    it('nagiyu.com を含む別ドメイン（nagiyu.com.evil.example.com）はフォールバックする', () => {
      const result = resolveRefreshCallbackUrl('https://nagiyu.com.evil.example.com/', BASE_URL);
      expect(result).toBe(BASE_URL);
    });
  });

  describe('apex ドメイン', () => {
    it('https://nagiyu.com（本体）は許可する', () => {
      const url = 'https://nagiyu.com/';
      const result = resolveRefreshCallbackUrl(url, BASE_URL);
      expect(result).toBe(url);
    });
  });

  describe('空 / 未指定のフォールバック', () => {
    it('null のとき baseUrl を返す', () => {
      const result = resolveRefreshCallbackUrl(null, BASE_URL);
      expect(result).toBe(BASE_URL);
    });

    it('undefined のとき baseUrl を返す', () => {
      const result = resolveRefreshCallbackUrl(undefined, BASE_URL);
      expect(result).toBe(BASE_URL);
    });

    it('空文字列のとき baseUrl を返す', () => {
      const result = resolveRefreshCallbackUrl('', BASE_URL);
      expect(result).toBe(BASE_URL);
    });
  });
});
