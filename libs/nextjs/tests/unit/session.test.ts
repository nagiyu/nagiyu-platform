import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createSessionGetter, resolveTestUser } from '../../src/session';

interface MockAuthSession {
  user?: {
    id?: string;
    email?: string;
    roles?: string[];
  };
  expires?: string;
}

describe('resolveTestUser', () => {
  const ENV_KEYS = [
    'TEST_USER_ID',
    'TEST_USER_EMAIL',
    'TEST_USER_NAME',
    'TEST_USER_IMAGE',
    'TEST_USER_ROLES',
  ] as const;

  // テスト後に環境変数を元に戻す
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

  beforeEach(() => {
    ENV_KEYS.forEach((key) => {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    });
  });

  afterEach(() => {
    ENV_KEYS.forEach((key) => {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    });
  });

  it('環境変数未設定の場合は既定値を返す', () => {
    const user = resolveTestUser();
    expect(user).toEqual({
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      image: undefined,
      roles: [],
    });
  });

  it('defaultRoles が適用される', () => {
    const user = resolveTestUser({ defaultRoles: ['admin'] });
    expect(user.roles).toEqual(['admin']);
  });

  it('環境変数を設定した場合は上書きされる', () => {
    process.env.TEST_USER_ID = 'env-user-id';
    process.env.TEST_USER_EMAIL = 'env@example.com';
    process.env.TEST_USER_NAME = 'Env User';
    process.env.TEST_USER_IMAGE = 'https://example.com/avatar.png';

    const user = resolveTestUser();
    expect(user.id).toBe('env-user-id');
    expect(user.email).toBe('env@example.com');
    expect(user.name).toBe('Env User');
    expect(user.image).toBe('https://example.com/avatar.png');
  });

  it('TEST_USER_ROLES をカンマ区切りで複数ロールに分割する', () => {
    process.env.TEST_USER_ROLES = 'admin,viewer,editor';
    const user = resolveTestUser();
    expect(user.roles).toEqual(['admin', 'viewer', 'editor']);
  });

  it('TEST_USER_ROLES が設定されている場合は defaultRoles より優先される', () => {
    process.env.TEST_USER_ROLES = 'custom-role';
    const user = resolveTestUser({ defaultRoles: ['admin'] });
    expect(user.roles).toEqual(['custom-role']);
  });

  it('TEST_USER_IMAGE が未設定の場合は undefined', () => {
    const user = resolveTestUser();
    expect(user.image).toBeUndefined();
  });
});

describe('createSessionGetter', () => {
  beforeEach(() => {
    delete process.env.SKIP_AUTH_CHECK;
  });

  it('SKIP_AUTH_CHECK=true の場合はテストセッションを返す', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    const auth = jest.fn<() => Promise<MockAuthSession | null>>();
    const getSession = createSessionGetter<MockAuthSession, { userId: string }>({
      auth,
      createTestSession: () => ({ userId: 'test-user-id' }),
      mapSession: (session) => ({ userId: session.user.id ?? '' }),
    });

    const session = await getSession();

    expect(session).toEqual({ userId: 'test-user-id' });
    expect(auth).not.toHaveBeenCalled();
  });

  it('認証セッションが null の場合は null を返す', async () => {
    const auth = jest.fn<() => Promise<MockAuthSession | null>>().mockResolvedValue(null);
    const getSession = createSessionGetter<MockAuthSession, { userId: string }>({
      auth,
      createTestSession: () => ({ userId: 'test-user-id' }),
      mapSession: (session) => ({ userId: session.user.id ?? '' }),
    });

    const session = await getSession();

    expect(session).toBeNull();
  });

  it('認証セッションに user がない場合は null を返す', async () => {
    const auth = jest
      .fn<() => Promise<MockAuthSession | null>>()
      .mockResolvedValue({ expires: new Date().toISOString() });
    const getSession = createSessionGetter<MockAuthSession, { userId: string }>({
      auth,
      createTestSession: () => ({ userId: 'test-user-id' }),
      mapSession: (session) => ({ userId: session.user.id ?? '' }),
    });

    const session = await getSession();

    expect(session).toBeNull();
  });

  it('認証済みセッションをサービス向け形式に変換する', async () => {
    const auth = jest.fn<() => Promise<MockAuthSession | null>>().mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        roles: ['admin'],
      },
      expires: '2026-01-01T00:00:00Z',
    });
    const getSession = createSessionGetter<MockAuthSession, { userId: string; email: string }>({
      auth,
      createTestSession: () => ({ userId: 'test-user-id', email: 'test@example.com' }),
      mapSession: (session) => ({
        userId: session.user.id ?? '',
        email: session.user.email ?? '',
      }),
    });

    const session = await getSession();

    expect(session).toEqual({
      userId: 'user-1',
      email: 'test@example.com',
    });
  });

  it('mapSession 省略時は認証済みセッションをそのまま返す', async () => {
    const mockSession: MockAuthSession = {
      user: { id: 'user-2', email: 'passthrough@example.com', roles: ['viewer'] },
      expires: '2026-06-01T00:00:00Z',
    };
    const auth = jest.fn<() => Promise<MockAuthSession | null>>().mockResolvedValue(mockSession);
    const getSession = createSessionGetter<MockAuthSession>({
      auth,
      createTestSession: () => ({ user: { id: 'test', email: 'test@example.com' }, expires: '' }),
    });

    const session = await getSession();

    expect(session).toEqual(mockSession);
  });

  it('mapSession 省略・SKIP_AUTH_CHECK=true の場合はテストセッションを返す', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    const auth = jest.fn<() => Promise<MockAuthSession | null>>();
    const testSession = { user: { id: 'test-id', email: 'test@example.com' }, expires: '' };
    const getSession = createSessionGetter<MockAuthSession>({
      auth,
      createTestSession: () => testSession,
    });

    const session = await getSession();

    expect(session).toEqual(testSession);
    expect(auth).not.toHaveBeenCalled();
  });
});
