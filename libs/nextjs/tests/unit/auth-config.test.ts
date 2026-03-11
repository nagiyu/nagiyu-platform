import { describe, expect, it } from '@jest/globals';
import {
  createAuthCallbacks,
  createAuthConfig,
  createAuthCookieOptions,
} from '../../src/auth-config';

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
    const session = await callbacks.session?.({
      session: {
        user: {
          id: '',
          email: '',
          name: '',
          roles: [],
        },
        expires: '',
      },
      token: {
        sub: 'sub-user-id',
      },
    } as never);

    expect(session?.user?.id).toBe('sub-user-id');
  });

  it('includeSubAsUserIdFallback=false の場合は token.sub を user.id に使用しない', async () => {
    const callbacks = createAuthCallbacks();
    const session = await callbacks.session?.({
      session: {
        user: {
          id: '',
          email: '',
          name: '',
          roles: [],
        },
        expires: '',
      },
      token: {
        sub: 'sub-user-id',
      },
    } as never);

    expect(session?.user?.id).toBe('');
  });

  it('includeSubAsUserIdFallback=true でも token.userId が優先される', async () => {
    const callbacks = createAuthCallbacks({ includeSubAsUserIdFallback: true });
    const session = await callbacks.session?.({
      session: {
        user: {
          id: '',
          email: '',
          name: '',
          roles: [],
        },
        expires: '',
      },
      token: {
        userId: 'explicit-user-id',
        sub: 'sub-user-id',
      },
    } as never);

    expect(session?.user?.id).toBe('explicit-user-id');
  });
});
