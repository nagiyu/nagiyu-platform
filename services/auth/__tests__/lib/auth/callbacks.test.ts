import { authConfig } from '@/lib/auth/auth';
import type { Account, Profile, User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

describe('Auth Callbacks', () => {
  describe('signIn callback', () => {
    test('should return false when account is missing', async () => {
      if (!authConfig.callbacks?.signIn) {
        fail('signIn callback is not defined');
      }

      const result = await authConfig.callbacks.signIn({
        user: { id: '123', email: 'test@example.com' } as User,
        account: null,
        profile: {} as Profile,
      });

      expect(result).toBe(false);
    });

    test('should return false when email is missing', async () => {
      if (!authConfig.callbacks?.signIn) {
        fail('signIn callback is not defined');
      }

      const result = await authConfig.callbacks.signIn({
        user: { id: '123' } as User,
        account: { providerAccountId: 'google_123', provider: 'google', type: 'oauth' } as Account,
        profile: {} as Profile,
      });

      expect(result).toBe(false);
    });
  });

  describe('session callback', () => {
    test('should map token properties to session user', async () => {
      if (!authConfig.callbacks?.session) {
        fail('session callback is not defined');
      }

      const mockToken: JWT = {
        userId: 'user_123',
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://example.com/avatar.jpg',
        roles: ['admin'],
      };

      const mockSession = {
        user: {
          id: '',
          email: '',
          name: '',
          image: undefined,
          roles: [],
        },
        expires: '2024-12-31',
      };

      const result = await authConfig.callbacks.session({
        session: mockSession,
        token: mockToken,
      });

      expect(result.user.id).toBe('user_123');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.name).toBe('Test User');
      expect(result.user.image).toBe('https://example.com/avatar.jpg');
      expect(result.user.roles).toEqual(['admin']);
    });

    test('should handle missing token properties with defaults', async () => {
      if (!authConfig.callbacks?.session) {
        fail('session callback is not defined');
      }

      const mockToken: JWT = {};

      const mockSession = {
        user: {
          id: '',
          email: '',
          name: '',
          image: undefined,
          roles: [],
        },
        expires: '2024-12-31',
      };

      const result = await authConfig.callbacks.session({
        session: mockSession,
        token: mockToken,
      });

      expect(result.user.id).toBe('');
      expect(result.user.email).toBe('');
      expect(result.user.name).toBe('');
      expect(result.user.image).toBeUndefined();
      expect(result.user.roles).toEqual([]);
    });
  });
});
