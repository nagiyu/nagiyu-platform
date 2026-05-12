import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createSessionGetter } from '../../src/session';

interface MockAuthSession {
  user?: {
    id?: string;
    email?: string;
    roles?: string[];
  };
  expires?: string;
}

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
    const auth = jest
      .fn<() => Promise<MockAuthSession | null>>()
      .mockResolvedValue(mockSession);
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
