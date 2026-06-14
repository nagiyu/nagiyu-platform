/**
 * resolveRefreshCallbackUrl のユニットテスト
 *
 * auth の redirect コールバックと同じ許可基準を検証:
 *   - 同一オリジン（baseUrl で始まる URL）は許可
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
      const url = 'http://dev-admin.nagiyu.com/';
      const result = resolveRefreshCallbackUrl(url, BASE_URL);
      expect(result).toBe(url);
    });

    it('dev-*.nagiyu.com も許可する', () => {
      const url = 'https://dev-stock-tracker.nagiyu.com/';
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

    it('相対パスはフォールバックする', () => {
      // 相対パスは baseUrl で始まらず *.nagiyu.com にもマッチしない
      const result = resolveRefreshCallbackUrl('/relative/path', BASE_URL);
      expect(result).toBe(BASE_URL);
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
