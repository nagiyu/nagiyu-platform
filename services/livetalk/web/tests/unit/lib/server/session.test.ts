/**
 * @jest-environment node
 */

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

import { auth } from '@/auth';
import { getSession } from '@/lib/server/session';

const mockAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;

describe('getSession', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it('SKIP_AUTH_CHECK=true でテスト用セッションを返す（既定 role）', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    delete process.env.TEST_USER_EMAIL;
    delete process.env.TEST_USER_ROLES;

    const session = await getSession();
    expect(session?.user.email).toBe('test@example.com');
    expect(session?.user.roles).toEqual(['livetalk-user']);
  });

  it('TEST_USER_EMAIL / TEST_USER_ROLES を尊重する', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    process.env.TEST_USER_EMAIL = 'taro@example.com';
    process.env.TEST_USER_ROLES = 'admin,livetalk-user';

    const session = await getSession();
    expect(session?.user.email).toBe('taro@example.com');
    expect(session?.user.roles).toEqual(['admin', 'livetalk-user']);
  });

  it('auth() が null のとき null を返す', async () => {
    delete process.env.SKIP_AUTH_CHECK;
    mockAuth.mockResolvedValueOnce(null);
    expect(await getSession()).toBeNull();
  });

  it('NextAuth session を Session 型にマップする', async () => {
    delete process.env.SKIP_AUTH_CHECK;
    mockAuth.mockResolvedValueOnce({
      user: {
        id: 'user-1',
        email: 'a@example.com',
        name: 'Alice',
        roles: ['livetalk-user'],
      },
      expires: '2026-12-31T00:00:00.000Z',
    });
    const session = await getSession();
    expect(session?.user.userId).toBe('user-1');
    expect(session?.user.googleId).toBe('user-1');
    expect(session?.user.email).toBe('a@example.com');
    expect(session?.user.name).toBe('Alice');
    expect(session?.user.roles).toEqual(['livetalk-user']);
    expect(session?.expires).toBe('2026-12-31T00:00:00.000Z');
  });

  it('NextAuth session のフィールド欠落でも安全に既定値を返す', async () => {
    delete process.env.SKIP_AUTH_CHECK;
    mockAuth.mockResolvedValueOnce({
      user: {},
    });
    const session = await getSession();
    expect(session?.user.userId).toBe('');
    expect(session?.user.googleId).toBe('');
    expect(session?.user.email).toBe('');
    expect(session?.user.name).toBe('');
    expect(session?.user.roles).toEqual([]);
    expect(typeof session?.expires).toBe('string');
  });
});
