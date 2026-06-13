import { describe, expect, it } from '@jest/globals';

jest.mock('@nagiyu/auth-core', () => ({
  auth: jest.fn(),
}));

jest.mock('@nagiyu/nextjs/session', () => ({
  resolveTestUser: jest.fn((options?: { defaultRoles?: string[] }) => ({
    id: process.env.TEST_USER_ID || 'test-user-id',
    email: process.env.TEST_USER_EMAIL || 'test@example.com',
    name: process.env.TEST_USER_NAME || 'Test User',
    image: process.env.TEST_USER_IMAGE || undefined,
    roles: process.env.TEST_USER_ROLES?.split(',') || options?.defaultRoles || [],
  })),
  createSessionGetter: jest.fn(
    (config: {
      auth: () => Promise<unknown>;
      createTestSession: () => unknown;
      mapSession?: (session: unknown) => unknown;
    }) => {
      return async () => {
        if (process.env.SKIP_AUTH_CHECK === 'true') {
          const testSession = config.createTestSession();
          return config.mapSession ? config.mapSession(testSession) : testSession;
        }
        const session = await config.auth();
        if (!session) return null;
        return config.mapSession ? config.mapSession(session) : session;
      };
    }
  ),
}));

import { auth as mockedAuth } from '@nagiyu/auth-core';

describe('getSession', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('SKIP_AUTH_CHECK=true のときはテスト用セッションを返す', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    process.env.TEST_USER_EMAIL = 'mock@example.com';
    process.env.TEST_USER_ROLES = 'admin,viewer';

    const { getSession } = await import('../../../../src/lib/auth/session');
    const session = await getSession();

    expect(session).toBeDefined();
    expect(session?.user?.email).toBe('mock@example.com');
    expect(session?.user?.roles).toEqual(['admin', 'viewer']);
  });

  it('TEST_USER_EMAIL が未設定なら test@example.com を使う', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    delete process.env.TEST_USER_EMAIL;
    delete process.env.TEST_USER_ROLES;

    const { getSession } = await import('../../../../src/lib/auth/session');
    const session = await getSession();

    expect(session?.user?.email).toBe('test@example.com');
    expect(session?.user?.roles).toEqual(['admin']);
  });

  it('SKIP_AUTH_CHECK 未設定で auth が null を返すと null', async () => {
    delete process.env.SKIP_AUTH_CHECK;
    (mockedAuth as jest.Mock).mockResolvedValueOnce(null);

    const { getSession } = await import('../../../../src/lib/auth/session');
    const session = await getSession();

    expect(session).toBeNull();
  });

  it('SKIP_AUTH_CHECK 未設定で auth が session を返すとそのまま返す', async () => {
    delete process.env.SKIP_AUTH_CHECK;
    (mockedAuth as jest.Mock).mockResolvedValueOnce({
      user: { id: 'u1', email: 'u1@example.com', name: 'U1', roles: ['admin'] },
      expires: '2099-01-01T00:00:00.000Z',
    });

    const { getSession } = await import('../../../../src/lib/auth/session');
    const session = await getSession();

    expect(session?.user?.id).toBe('u1');
    expect(session?.expires).toBe('2099-01-01T00:00:00.000Z');
  });
});
