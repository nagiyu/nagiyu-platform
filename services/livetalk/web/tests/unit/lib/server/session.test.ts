/**
 * @jest-environment node
 */

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

const mockHeaders = jest.fn();
jest.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

import { auth } from '@/auth';
import { getSession } from '@/lib/server/session';

const mockAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;

describe('getSession', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockHeaders.mockImplementation(() => {
      throw new Error('リクエストスコープ外');
    });
  });

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

  it('テストセッションの有効期限は 30 日後になる', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';

    const session = await getSession();

    const diff = new Date(session!.expires).getTime() - Date.now();
    expect(Math.abs(diff - 30 * 24 * 60 * 60 * 1000)).toBeLessThan(60 * 1000);
  });

  it('ヘッダ x-test-user-roles が TEST_USER_ROLES より優先される', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    process.env.TEST_USER_ROLES = 'admin';
    mockHeaders.mockResolvedValue(new Headers({ 'x-test-user-roles': 'viewer' }));

    const session = await getSession();

    expect(session?.user.roles).toEqual(['viewer']);
  });

  it('TEST_USER_ROLES が空文字なら既定ロールに戻る', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    process.env.TEST_USER_ROLES = '';

    const session = await getSession();

    expect(session?.user.roles).toEqual(['livetalk-user']);
  });

  it('auth() が null のとき null を返す', async () => {
    delete process.env.SKIP_AUTH_CHECK;
    mockAuth.mockResolvedValueOnce(null);
    expect(await getSession()).toBeNull();
  });

  it('auth() のセッションをそのまま返す', async () => {
    delete process.env.SKIP_AUTH_CHECK;
    const authSession = {
      user: {
        id: 'user-1',
        email: 'a@example.com',
        name: 'Alice',
        roles: ['livetalk-user'],
      },
      expires: '2026-12-31T00:00:00.000Z',
    };
    mockAuth.mockResolvedValueOnce(authSession);

    expect(await getSession()).toEqual(authSession);
  });

  it('テストセッションのユーザー ID は TEST_USER_ID 既定値になる', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    delete process.env.TEST_USER_ID;

    const session = await getSession();

    expect(session?.user.id).toBe('test-user-id');
  });
});
