import { describe, expect, it } from '@jest/globals';
import {
  createAuthCallbacks,
  createAuthConfig,
  createAuthCookieOptions,
  createServiceAuthConfig,
} from '../../src/auth-config';

type SessionCallback = NonNullable<ReturnType<typeof createAuthCallbacks>['session']>;
type SessionCallbackParams = Parameters<SessionCallback>[0];

async function executeSessionCallback(
  callback: SessionCallback,
  token: SessionCallbackParams['token']
) {
  return await callback({
    session: {
      user: {
        id: '',
        email: '',
        name: '',
        roles: [],
        emailVerified: null,
      } as SessionCallbackParams['session']['user'],
      expires: new Date(Date.now() + 60 * 60 * 1000) as SessionCallbackParams['session']['expires'],
      sessionToken: '',
      userId: '',
    },
    user: {
      id: '',
      email: '',
      emailVerified: null,
    } as SessionCallbackParams['user'],
    token,
    newSession: undefined,
    trigger: 'update',
  });
}

describe('auth-config', () => {
  // NAGIYU_ENV は Next.js のビルド時置換を受けない専用の実行時環境変数。
  // NODE_ENV==='development' のときは NAGIYU_ENV の値に関わらずローカル開発扱いになる。
  describe('NODE_ENV=development（ローカル開発）', () => {
    it('NAGIYU_ENV に関わらず domain 未設定・secure=false になる', () => {
      expect(createAuthCookieOptions('development').domain).toBeUndefined();
      expect(createAuthCookieOptions('development').secure).toBe(false);
      expect(createAuthCookieOptions('development', 'dev').domain).toBeUndefined();
      expect(createAuthCookieOptions('development', 'prod').secure).toBe(false);
    });

    it('Cookie 名にサフィックスが付与されない', () => {
      const config = createAuthConfig({ nodeEnv: 'development', nagiyuEnv: 'dev' });

      expect(config.cookies?.sessionToken?.name).toBe('__Secure-authjs.session-token');
    });
  });

  describe('NODE_ENV=production（デプロイ後）+ NAGIYU_ENV=prod', () => {
    it('domainが.nagiyu.comになりsecure=trueになる', () => {
      const options = createAuthCookieOptions('production', 'prod');

      expect(options.domain).toBe('.nagiyu.com');
      expect(options.secure).toBe(true);
    });

    it('Cookie 名にサフィックスが付与されない', () => {
      const config = createAuthConfig({ nodeEnv: 'production', nagiyuEnv: 'prod' });

      expect(config.cookies?.sessionToken?.name).toBe('__Secure-authjs.session-token');
      expect(config.cookies?.callbackUrl?.name).toBe('__Secure-authjs.callback-url');
    });
  });

  describe('NODE_ENV=production（デプロイ後）+ NAGIYU_ENV=dev', () => {
    it('domainが.dev.nagiyu.comになりsecure=trueになる', () => {
      const options = createAuthCookieOptions('production', 'dev');

      expect(options.domain).toBe('.dev.nagiyu.com');
      expect(options.secure).toBe(true);
    });

    it('Cookie名に.devサフィックスが付与される', () => {
      const config = createAuthConfig({ nodeEnv: 'production', nagiyuEnv: 'dev' });

      expect(config.cookies?.sessionToken?.name).toBe('__Secure-authjs.session-token.dev');
      expect(config.cookies?.callbackUrl?.name).toBe('__Secure-authjs.callback-url.dev');
    });
  });

  describe('NAGIYU_ENV 未設定（安全側のデフォルト）', () => {
    it('NODE_ENV=production でも prod 扱い（domain=.nagiyu.com、サフィックスなし）になる', () => {
      const options = createAuthCookieOptions('production', undefined);
      const config = createAuthConfig({ nodeEnv: 'production' });

      expect(options.domain).toBe('.nagiyu.com');
      expect(options.secure).toBe(true);
      expect(config.cookies?.sessionToken?.name).toBe('__Secure-authjs.session-token');
    });
  });

  it('includeSubAsUserIdFallback=true の場合は token.sub を user.id にフォールバックする', async () => {
    const callbacks = createAuthCallbacks({ includeSubAsUserIdFallback: true });
    expect(callbacks.session).toBeDefined();

    const session = await executeSessionCallback(callbacks.session!, {
      sub: 'sub-user-id',
    });
    expect(session.user).toBeDefined();
    expect(session.user!.id).toBe('sub-user-id');
  });

  it('includeSubAsUserIdFallback=false の場合は token.sub を user.id に使用しない', async () => {
    const callbacks = createAuthCallbacks();
    expect(callbacks.session).toBeDefined();

    const session = await executeSessionCallback(callbacks.session!, {
      sub: 'sub-user-id',
    });
    expect(session.user).toBeDefined();
    expect(session.user!.id).toBe('');
  });

  it('includeSubAsUserIdFallback=true でも token.userId が優先される', async () => {
    const callbacks = createAuthCallbacks({ includeSubAsUserIdFallback: true });
    expect(callbacks.session).toBeDefined();

    const session = await executeSessionCallback(callbacks.session!, {
      userId: 'explicit-user-id',
      sub: 'sub-user-id',
    });
    expect(session.user).toBeDefined();
    expect(session.user!.id).toBe('explicit-user-id');
  });

  it('createServiceAuthConfig は共通の signIn ページを設定する', () => {
    process.env.NEXT_PUBLIC_AUTH_URL = 'https://auth.example.com';

    const config = createServiceAuthConfig();

    expect(config.pages?.signIn).toBe('https://auth.example.com/signin');
  });

  it('createServiceAuthConfig は NEXT_PUBLIC_AUTH_URL 未設定時に /signin を使う', () => {
    delete process.env.NEXT_PUBLIC_AUTH_URL;

    const config = createServiceAuthConfig();

    expect(config.pages?.signIn).toBe('/signin');
  });

  it('createServiceAuthConfig でも includeSubAsUserIdFallback を適用する', async () => {
    const config = createServiceAuthConfig({ includeSubAsUserIdFallback: true });
    expect(config.callbacks?.session).toBeDefined();

    const session = await executeSessionCallback(config.callbacks!.session!, {
      sub: 'service-auth-sub-user-id',
    });
    expect(session.user).toBeDefined();
    expect(session.user!.id).toBe('service-auth-sub-user-id');
  });
});
