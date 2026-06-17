/**
 * isAllowedNagiyuRedirectUrl のユニットテスト
 *
 * オープンリダイレクト対策として、ホスト名の途中に許可ドメインを含む
 * 攻撃 URL を拒否することを重点的に検証する。
 */

import { isAllowedNagiyuRedirectUrl } from '../../../src/auth/redirect';

const BASE_URL = 'https://auth.nagiyu.com';

describe('isAllowedNagiyuRedirectUrl', () => {
  describe('許可されるケース', () => {
    it('同一オリジン（baseUrl 同一 origin のパス付き）は許可', () => {
      expect(isAllowedNagiyuRedirectUrl(`${BASE_URL}/dashboard`, BASE_URL)).toBe(true);
    });

    it('サブドメイン *.nagiyu.com は許可', () => {
      expect(isAllowedNagiyuRedirectUrl('https://admin.nagiyu.com/', BASE_URL)).toBe(true);
    });

    it('dev-*.nagiyu.com は許可', () => {
      expect(isAllowedNagiyuRedirectUrl('https://dev-stock-tracker.nagiyu.com/x', BASE_URL)).toBe(
        true
      );
    });

    it('apex ドメイン nagiyu.com は許可', () => {
      expect(isAllowedNagiyuRedirectUrl('https://nagiyu.com/', BASE_URL)).toBe(true);
    });

    it('http スキームの *.nagiyu.com も許可', () => {
      expect(isAllowedNagiyuRedirectUrl('http://admin.nagiyu.com/', BASE_URL)).toBe(true);
    });
  });

  describe('拒否されるケース（オープンリダイレクト対策）', () => {
    it('ホスト途中に nagiyu.com を含む別ドメインは拒否', () => {
      expect(isAllowedNagiyuRedirectUrl('https://auth.nagiyu.com.evil.com/phish', BASE_URL)).toBe(
        false
      );
    });

    it('nagiyu.com.attacker.com は拒否', () => {
      expect(isAllowedNagiyuRedirectUrl('https://nagiyu.com.attacker.com/', BASE_URL)).toBe(false);
    });

    it('末尾に別 TLD が続く nagiyu.como は拒否', () => {
      expect(isAllowedNagiyuRedirectUrl('https://x.nagiyu.como/', BASE_URL)).toBe(false);
    });

    it('全く別ドメインは拒否', () => {
      expect(isAllowedNagiyuRedirectUrl('https://evil.example.com/', BASE_URL)).toBe(false);
    });

    it('javascript: スキームは拒否', () => {
      expect(isAllowedNagiyuRedirectUrl('javascript:alert(1)', BASE_URL)).toBe(false);
    });

    it('data: スキームは拒否', () => {
      expect(isAllowedNagiyuRedirectUrl('data:text/html,<h1>x</h1>', BASE_URL)).toBe(false);
    });

    it('相対パスは拒否（絶対 URL としてパース不能）', () => {
      expect(isAllowedNagiyuRedirectUrl('/relative/path', BASE_URL)).toBe(false);
    });
  });
});
