/**
 * @jest-environment node
 */

jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    handlers: {},
    auth: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  })),
}));

import { authConfig } from '../../auth';

describe('authConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('Auth Consumer パターンの最小設定になっている', () => {
    expect(authConfig.providers).toEqual([]);
    expect(authConfig.session?.strategy).toBe('jwt');
    expect(authConfig.cookies?.sessionToken?.name).toContain('__Secure-authjs.session-token');
  });

  it('secret は NextAuth が AUTH_SECRET 環境変数から自動取得するため config には設定しない', () => {
    process.env.AUTH_SECRET = 'test-auth-secret';

    jest.isolateModules(() => {
      const { authConfig: reloadedAuthConfig } =
        jest.requireActual<typeof import('../../auth')>('../../auth');
      // createAuthConfig は secret を含まないため、NextAuth が AUTH_SECRET env var を直接参照する
      expect(reloadedAuthConfig.secret).toBeUndefined();
    });
  });

  // Next.js はビルド時（next build）に NODE_ENV を 'production' へ静的置換するため、
  // デプロイ後の dev/prod 判定には NAGIYU_ENV（ビルド時に置換されない実行時環境変数）を使う
  // （@nagiyu/nextjs の auth-config.ts 参照）。
  it('NODE_ENV=production かつ NAGIYU_ENV=dev の場合は .dev サフィックス付きクッキー名を利用する', () => {
    process.env.NODE_ENV = 'production';
    process.env.NAGIYU_ENV = 'dev';

    jest.isolateModules(() => {
      const { authConfig: reloadedAuthConfig } =
        jest.requireActual<typeof import('../../auth')>('../../auth');
      expect(reloadedAuthConfig.cookies?.sessionToken?.name).toBe(
        '__Secure-authjs.session-token.dev'
      );
    });
  });

  it('NODE_ENV=production かつ NAGIYU_ENV=prod の場合はサフィックスなしクッキー名を利用する', () => {
    process.env.NODE_ENV = 'production';
    process.env.NAGIYU_ENV = 'prod';

    jest.isolateModules(() => {
      const { authConfig: reloadedAuthConfig } =
        jest.requireActual<typeof import('../../auth')>('../../auth');
      expect(reloadedAuthConfig.cookies?.sessionToken?.name).toBe('__Secure-authjs.session-token');
    });
  });

  it('NAGIYU_ENV 未設定の場合は prod 扱い（サフィックスなし）になる', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.NAGIYU_ENV;

    jest.isolateModules(() => {
      const { authConfig: reloadedAuthConfig } =
        jest.requireActual<typeof import('../../auth')>('../../auth');
      expect(reloadedAuthConfig.cookies?.sessionToken?.name).toBe('__Secure-authjs.session-token');
    });
  });
});
