import { describe, expect, it } from '@jest/globals';
import {
  createAuthCallbacks,
  createAuthConfig,
  createAuthCookieOptions,
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
  it('development環境ではdomain未設定かつsecure=falseになる', () => {
    const options = createAuthCookieOptions('development');

    expect(options.domain).toBeUndefined();
    expect(options.secure).toBe(false);
  });

  it('dev環境ではCookie名に.devサフィックスが付与される', () => {
    const config = createAuthConfig({ nodeEnv: 'dev' });

    expect(config.cookies?.sessionToken?.name).toBe('__Secure-authjs.session-token.dev');
    expect(config.cookies?.callbackUrl?.name).toBe('__Secure-authjs.callback-url.dev');
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
});
