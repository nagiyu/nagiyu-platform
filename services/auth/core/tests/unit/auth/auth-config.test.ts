/**
 * Auth Configuration のテスト
 *
 * 独自に条件式を再実装するのではなく、実際に使われている @nagiyu/nextjs の
 * createAuthCookieOptions / createAuthCookies を通して Cookie 名・domain・secure が
 * 環境ごとに正しく設定されることを確認する。
 *
 * 判定基準（@nagiyu/nextjs の auth-config.ts 参照）:
 *   - NODE_ENV === 'development'（ローカル開発）: domain 未設定、secure=false、サフィックスなし
 *   - NODE_ENV !== 'development' の場合、NAGIYU_ENV（ビルド時に置換されない実行時環境変数）で判定:
 *     - NAGIYU_ENV === 'dev': domain=.dev.nagiyu.com、secure=true、Cookie 名に .dev サフィックス
 *     - NAGIYU_ENV === 'prod' または未設定: domain=.nagiyu.com、secure=true、サフィックスなし
 */

import { createAuthCookieOptions, createAuthCookies } from '@nagiyu/nextjs';

describe('Auth Configuration - Environment-based Cookie Settings', () => {
  describe('Cookie Domain / Secure', () => {
    it('NODE_ENV=development の場合、domain は undefined（localhost 専用）、secure は false', () => {
      const options = createAuthCookieOptions('development');

      expect(options.domain).toBeUndefined();
      expect(options.secure).toBe(false);
    });

    it('NODE_ENV=production かつ NAGIYU_ENV=prod の場合、domain は .nagiyu.com、secure は true', () => {
      const options = createAuthCookieOptions('production', 'prod');

      expect(options.domain).toBe('.nagiyu.com');
      expect(options.secure).toBe(true);
    });

    it('NODE_ENV=production かつ NAGIYU_ENV=dev の場合、domain は .dev.nagiyu.com、secure は true', () => {
      const options = createAuthCookieOptions('production', 'dev');

      expect(options.domain).toBe('.dev.nagiyu.com');
      expect(options.secure).toBe(true);
    });

    it('NAGIYU_ENV 未設定の場合は prod 扱い（domain は .nagiyu.com）', () => {
      const options = createAuthCookieOptions('production', undefined);

      expect(options.domain).toBe('.nagiyu.com');
      expect(options.secure).toBe(true);
    });
  });

  describe('Cookie Name Suffix', () => {
    const cookieTypes: Array<{
      key: keyof NonNullable<ReturnType<typeof createAuthCookies>>;
      base: string;
      description: string;
    }> = [
      { key: 'sessionToken', base: '__Secure-authjs.session-token', description: 'Session Token' },
      { key: 'callbackUrl', base: '__Secure-authjs.callback-url', description: 'Callback URL' },
      { key: 'csrfToken', base: '__Host-authjs.csrf-token', description: 'CSRF Token' },
      { key: 'state', base: '__Secure-authjs.state', description: 'OAuth State' },
      {
        key: 'pkceCodeVerifier',
        base: '__Secure-authjs.pkce.code_verifier',
        description: 'PKCE Code Verifier',
      },
      { key: 'nonce', base: '__Secure-authjs.nonce', description: 'Nonce' },
    ];

    cookieTypes.forEach(({ key, base, description }) => {
      describe(description, () => {
        it('NODE_ENV=production かつ NAGIYU_ENV=dev の場合、.dev サフィックスが付く', () => {
          const cookies = createAuthCookies('production', 'dev');

          expect(cookies[key]?.name).toBe(`${base}.dev`);
        });

        it('NODE_ENV=production かつ NAGIYU_ENV=prod の場合、サフィックスなし', () => {
          const cookies = createAuthCookies('production', 'prod');

          expect(cookies[key]?.name).toBe(base);
        });

        it('NODE_ENV=development の場合、サフィックスなし', () => {
          const cookies = createAuthCookies('development', 'dev');

          expect(cookies[key]?.name).toBe(base);
        });
      });
    });

    it('すべての Cookie が dev と prod で異なる名前を持つ（環境間の混同を防ぐ）', () => {
      const devCookies = createAuthCookies('production', 'dev');
      const prodCookies = createAuthCookies('production', 'prod');

      cookieTypes.forEach(({ key }) => {
        expect(devCookies[key]?.name).not.toBe(prodCookies[key]?.name);
      });
    });
  });

  describe('Security and Isolation', () => {
    it('dev 環境（NAGIYU_ENV=dev）は .dev.nagiyu.com 配下のみで Cookie を共有する', () => {
      const options = createAuthCookieOptions('production', 'dev');
      const cookies = createAuthCookies('production', 'dev');

      // domain が .dev.nagiyu.com なので share-together.dev.nagiyu.com 等で SSO 可能で、
      // prod ドメイン（*.nagiyu.com）へは漏れない
      expect(options.domain).toBe('.dev.nagiyu.com');
      expect(cookies.sessionToken?.name).toBe('__Secure-authjs.session-token.dev');
    });

    it('prod 環境は .nagiyu.com 全体で標準クッキー名により SSO 可能', () => {
      const options = createAuthCookieOptions('production', 'prod');
      const cookies = createAuthCookies('production', 'prod');

      expect(options.domain).toBe('.nagiyu.com');
      expect(cookies.sessionToken?.name).toBe('__Secure-authjs.session-token');
    });
  });
});
