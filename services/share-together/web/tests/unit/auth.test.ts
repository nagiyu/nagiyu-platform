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

  it('AUTH_SECRET が設定されている場合は secret に反映される', () => {
    process.env.AUTH_SECRET = 'test-auth-secret';

    jest.isolateModules(() => {
      const { authConfig: reloadedAuthConfig } =
        jest.requireActual<typeof import('../../auth')>('../../auth');
      expect(reloadedAuthConfig.secret).toBe('test-auth-secret');
    });
  });

  it('NODE_ENV=production の場合はサフィックスなしクッキー名を利用する', () => {
    process.env.NODE_ENV = 'production';

    jest.isolateModules(() => {
      const { authConfig: reloadedAuthConfig } =
        jest.requireActual<typeof import('../../auth')>('../../auth');
      expect(reloadedAuthConfig.cookies?.sessionToken?.name).toBe(
        '__Secure-authjs.session-token'
      );
    });
  });

  it('NODE_ENV=prod の場合はサフィックスなしクッキー名を利用する', () => {
    process.env.NODE_ENV = 'prod';

    jest.isolateModules(() => {
      const { authConfig: reloadedAuthConfig } =
        jest.requireActual<typeof import('../../auth')>('../../auth');
      expect(reloadedAuthConfig.cookies?.sessionToken?.name).toBe('__Secure-authjs.session-token');
    });
  });
});
