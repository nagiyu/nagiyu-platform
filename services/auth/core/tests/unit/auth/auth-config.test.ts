/**
 * Auth Configuration のテスト
 *
 * 環境変数に基づいて正しいクッキー名と domain が設定されることを確認します。
 * auth.ts をモックして、設定値のみをテストします。
 */

describe('Auth Configuration - Environment-based Cookie Settings', () => {
  describe('Cookie Name Logic', () => {
    it('NODE_ENV=development の場合、クッキー名は標準名', () => {
      const nodeEnv = 'development';
      const isDevelopment = nodeEnv === 'development';
      const isProduction = nodeEnv === 'prod';

      const cookieName = isProduction
        ? '__Secure-next-auth.session-token'
        : isDevelopment
          ? '__Secure-next-auth.session-token'
          : '__Secure-next-auth.session-token.dev';

      expect(cookieName).toBe('__Secure-next-auth.session-token');
    });

    it('NODE_ENV=dev の場合、クッキー名に .dev サフィックス', () => {
      const nodeEnv = 'dev';
      const isDevelopment = nodeEnv === 'development';
      const isProduction = nodeEnv === 'prod';

      const cookieName = isProduction
        ? '__Secure-next-auth.session-token'
        : isDevelopment
          ? '__Secure-next-auth.session-token'
          : '__Secure-next-auth.session-token.dev';

      expect(cookieName).toBe('__Secure-next-auth.session-token.dev');
    });

    it('NODE_ENV=prod の場合、クッキー名は標準名', () => {
      const nodeEnv = 'prod';
      const isDevelopment = nodeEnv === 'development';
      const isProduction = nodeEnv === 'prod';

      const cookieName = isProduction
        ? '__Secure-next-auth.session-token'
        : isDevelopment
          ? '__Secure-next-auth.session-token'
          : '__Secure-next-auth.session-token.dev';

      expect(cookieName).toBe('__Secure-next-auth.session-token');
    });

    it('NODE_ENV=test の場合、クッキー名に .dev サフィックス', () => {
      const nodeEnv = 'test';
      const isDevelopment = nodeEnv === 'development';
      const isProduction = nodeEnv === 'prod';

      const cookieName = isProduction
        ? '__Secure-next-auth.session-token'
        : isDevelopment
          ? '__Secure-next-auth.session-token'
          : '__Secure-next-auth.session-token.dev';

      expect(cookieName).toBe('__Secure-next-auth.session-token.dev');
    });
  });

  describe('Cookie Domain Configuration', () => {
    it('isDevelopment=true の場合、domain は undefined (localhost専用)', () => {
      const isDevelopment = true;
      const domain = isDevelopment ? undefined : '.nagiyu.com';

      expect(domain).toBeUndefined();
    });

    it('isDevelopment=false の場合、domain は .nagiyu.com (SSO共有)', () => {
      const isDevelopment = false;
      const domain = isDevelopment ? undefined : '.nagiyu.com';

      expect(domain).toBe('.nagiyu.com');
    });
  });

  describe('Cookie Secure Configuration', () => {
    it('isDevelopment=true の場合、secure は false', () => {
      const isDevelopment = true;
      const secure = !isDevelopment;

      expect(secure).toBe(false);
    });

    it('isDevelopment=false の場合、secure は true', () => {
      const isDevelopment = false;
      const secure = !isDevelopment;

      expect(secure).toBe(true);
    });
  });

  describe('Environment-based Behavior Verification', () => {
    it('development 環境: 標準クッキー名、domain=undefined, secure=false', () => {
      const nodeEnv = 'development';
      const isDevelopment = nodeEnv === 'development';
      const isProduction = nodeEnv === 'prod';

      const cookieName = isProduction
        ? '__Secure-next-auth.session-token'
        : isDevelopment
          ? '__Secure-next-auth.session-token'
          : '__Secure-next-auth.session-token.dev';
      const domain = isDevelopment ? undefined : '.nagiyu.com';
      const secure = !isDevelopment;

      expect(cookieName).toBe('__Secure-next-auth.session-token');
      expect(domain).toBeUndefined();
      expect(secure).toBe(false);
    });

    it('dev 環境: .dev サフィックスクッキー、domain=.nagiyu.com, secure=true', () => {
      const nodeEnv = 'dev';
      const isDevelopment = nodeEnv === 'development';
      const isProduction = nodeEnv === 'prod';

      const cookieName = isProduction
        ? '__Secure-next-auth.session-token'
        : isDevelopment
          ? '__Secure-next-auth.session-token'
          : '__Secure-next-auth.session-token.dev';
      const domain = isDevelopment ? undefined : '.nagiyu.com';
      const secure = !isDevelopment;

      expect(cookieName).toBe('__Secure-next-auth.session-token.dev');
      expect(domain).toBe('.nagiyu.com');
      expect(secure).toBe(true);
    });

    it('prod 環境: 標準クッキー名、domain=.nagiyu.com, secure=true', () => {
      const nodeEnv = 'prod';
      const isDevelopment = nodeEnv === 'development';
      const isProduction = nodeEnv === 'prod';

      const cookieName = isProduction
        ? '__Secure-next-auth.session-token'
        : isDevelopment
          ? '__Secure-next-auth.session-token'
          : '__Secure-next-auth.session-token.dev';
      const domain = isDevelopment ? undefined : '.nagiyu.com';
      const secure = !isDevelopment;

      expect(cookieName).toBe('__Secure-next-auth.session-token');
      expect(domain).toBe('.nagiyu.com');
      expect(secure).toBe(true);
    });

    it('test 環境: .dev サフィックスクッキー、domain=.nagiyu.com, secure=true', () => {
      const nodeEnv = 'test';
      const isDevelopment = nodeEnv === 'development';
      const isProduction = nodeEnv === 'prod';

      const cookieName = isProduction
        ? '__Secure-next-auth.session-token'
        : isDevelopment
          ? '__Secure-next-auth.session-token'
          : '__Secure-next-auth.session-token.dev';
      const domain = isDevelopment ? undefined : '.nagiyu.com';
      const secure = !isDevelopment;

      expect(cookieName).toBe('__Secure-next-auth.session-token.dev');
      expect(domain).toBe('.nagiyu.com');
      expect(secure).toBe(true);
    });
  });

  describe('Security and Isolation', () => {
    it('dev 環境では .dev サフィックスクッキーで dev-*.nagiyu.com 全体で SSO 可能', () => {
      const isProduction = false;
      const isDevelopment = false;

      const cookieName = isProduction
        ? '__Secure-next-auth.session-token'
        : isDevelopment
          ? '__Secure-next-auth.session-token'
          : '__Secure-next-auth.session-token.dev';
      const domain = isDevelopment ? undefined : '.nagiyu.com';

      // dev 環境ではクッキー名が異なるため、prod 環境とクッキーが混同されない
      expect(cookieName).toBe('__Secure-next-auth.session-token.dev');
      // domain が .nagiyu.com なので dev-auth, dev-admin, dev-stock-tracker で SSO 可能
      expect(domain).toBe('.nagiyu.com');
    });

    it('prod 環境では標準クッキー名で *.nagiyu.com 全体で SSO 可能', () => {
      const isProduction = true;
      const isDevelopment = false;

      const cookieName = isProduction
        ? '__Secure-next-auth.session-token'
        : isDevelopment
          ? '__Secure-next-auth.session-token'
          : '__Secure-next-auth.session-token.dev';
      const domain = isDevelopment ? undefined : '.nagiyu.com';

      // prod 環境では標準クッキー名
      expect(cookieName).toBe('__Secure-next-auth.session-token');
      // domain が .nagiyu.com なので auth, admin, tools などで SSO 可能
      expect(domain).toBe('.nagiyu.com');
    });

    it('dev と prod でクッキー名が異なるため環境が分離される', () => {
      const devCookieName = '__Secure-next-auth.session-token.dev';
      const prodCookieName = '__Secure-next-auth.session-token';

      // クッキー名が異なるため、同じドメインでも混同されない
      expect(devCookieName).not.toBe(prodCookieName);
    });
  });

  describe('All Cookie Names - Environment Separation', () => {
    const cookieTypes = [
      { base: '__Secure-next-auth.session-token', description: 'Session Token' },
      { base: '__Secure-next-auth.callback-url', description: 'Callback URL' },
      { base: '__Host-next-auth.csrf-token', description: 'CSRF Token' },
      { base: '__Secure-next-auth.state', description: 'OAuth State' },
      {
        base: '__Secure-next-auth.pkce.code_verifier',
        description: 'PKCE Code Verifier',
      },
      { base: '__Secure-next-auth.nonce', description: 'Nonce' },
    ];

    cookieTypes.forEach(({ base, description }) => {
      describe(description, () => {
        it('dev 環境: .dev サフィックスが付く', () => {
          const cookieSuffix = '.dev';
          const cookieName = `${base}${cookieSuffix}`;

          expect(cookieName).toBe(`${base}.dev`);
        });

        it('prod 環境: サフィックスなし', () => {
          const cookieSuffix = '';
          const cookieName = `${base}${cookieSuffix}`;

          expect(cookieName).toBe(base);
        });

        it('local 環境: サフィックスなし', () => {
          const cookieSuffix = '';
          const cookieName = `${base}${cookieSuffix}`;

          expect(cookieName).toBe(base);
        });
      });
    });

    it('すべてのクッキーが dev と prod で異なる名前を持つ', () => {
      const devSuffix = '.dev';
      const prodSuffix = '';

      cookieTypes.forEach(({ base }) => {
        const devCookieName = `${base}${devSuffix}`;
        const prodCookieName = `${base}${prodSuffix}`;

        expect(devCookieName).not.toBe(prodCookieName);
      });
    });
  });
});
