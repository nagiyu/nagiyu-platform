import { getSession } from '../../../../src/lib/auth/session';
import { auth } from '../../../../src/auth';
import type { Session as NextAuthSession } from 'next-auth';

// リクエストスコープ外では headers() が例外を投げるため、ヘッダ読み取りだけを差し替える
const mockHeaders = jest.fn();
jest.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

// Mock the auth module
jest.mock('../../../../src/auth', () => ({
  auth: jest.fn(),
}));

const mockAuth = auth as unknown as jest.MockedFunction<() => Promise<NextAuthSession | null>>;

describe('getSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHeaders.mockImplementation(() => {
      throw new Error('リクエストスコープ外');
    });
    delete process.env.SKIP_AUTH_CHECK;
    delete process.env.TEST_USER_EMAIL;
    delete process.env.TEST_USER_ID;
    delete process.env.TEST_USER_NAME;
    delete process.env.TEST_USER_IMAGE;
    delete process.env.TEST_USER_ROLES;
  });

  describe('when SKIP_AUTH_CHECK is true', () => {
    beforeEach(() => {
      process.env.SKIP_AUTH_CHECK = 'true';
    });

    it('should return mock session data in Phase 1', async () => {
      const session = await getSession();

      expect(session).not.toBeNull();
      expect(session?.user).toBeDefined();
      expect(session?.user.id).toBe('test-user-id');
      expect(session?.user.email).toBe('test@example.com');
      expect(session?.user.name).toBe('Test User');
      expect(session?.user.roles).toEqual(['admin']);
    });

    it('should return user with email', async () => {
      const session = await getSession();

      expect(session?.user.email).toMatch(/@/);
    });

    it('should return user with at least one role', async () => {
      const session = await getSession();

      expect(session?.user.roles.length).toBeGreaterThan(0);
    });

    it('should use TEST_USER_EMAIL when provided', async () => {
      process.env.TEST_USER_EMAIL = 'custom@example.com';

      const session = await getSession();

      expect(session?.user.email).toBe('custom@example.com');
    });

    it('should use TEST_USER_ROLES when provided', async () => {
      process.env.TEST_USER_ROLES = 'admin,editor';

      const session = await getSession();

      expect(session?.user.roles).toEqual(['admin', 'editor']);
    });

    it('should expire in 30 days', async () => {
      const session = await getSession();

      const diff = new Date(session!.expires).getTime() - Date.now();
      expect(Math.abs(diff - 30 * 24 * 60 * 60 * 1000)).toBeLessThan(60 * 1000);
    });

    it('should prefer x-test-user-roles header over TEST_USER_ROLES', async () => {
      process.env.TEST_USER_ROLES = 'admin';
      mockHeaders.mockResolvedValue(new Headers({ 'x-test-user-roles': 'viewer' }));

      const session = await getSession();

      expect(session?.user.roles).toEqual(['viewer']);
    });

    it('should fall back to default roles when TEST_USER_ROLES is empty', async () => {
      process.env.TEST_USER_ROLES = '';

      const session = await getSession();

      expect(session?.user.roles).toEqual(['admin']);
    });
  });

  describe('when SKIP_AUTH_CHECK is false or not set', () => {
    it('should return session from auth() when user exists', async () => {
      const mockSession: NextAuthSession = {
        user: {
          id: 'user-123',
          email: 'real@example.com',
          name: 'Test User',
          roles: ['admin', 'user'],
        },
        expires: new Date().toISOString(),
      };
      mockAuth.mockResolvedValue(mockSession);

      const session = await getSession();

      expect(session).not.toBeNull();
      expect(session?.user.email).toBe('real@example.com');
      expect(session?.user.roles).toEqual(['admin', 'user']);
      expect(mockAuth).toHaveBeenCalledTimes(1);
    });

    it('should return null when auth() returns null', async () => {
      mockAuth.mockResolvedValue(null);

      const session = await getSession();

      expect(session).toBeNull();
      expect(mockAuth).toHaveBeenCalledTimes(1);
    });

    it('should return null when auth() returns session without user', async () => {
      mockAuth.mockResolvedValue({
        expires: new Date().toISOString(),
      } as NextAuthSession);

      const session = await getSession();

      expect(session).toBeNull();
      expect(mockAuth).toHaveBeenCalledTimes(1);
    });
  });
});
