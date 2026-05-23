import { getAuthError } from '../../../src/auth/auth-error';
import { COMMON_ERROR_MESSAGES } from '../../../src/constants/error-messages';
import type { Session } from '../../../src/auth/types';

const makeSession = (roles: string[]): Session => ({
  user: {
    userId: 'user-1',
    googleId: 'google-1',
    email: 'test@example.com',
    name: 'テストユーザー',
    roles,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  expires: '2099-01-01T00:00:00Z',
});

describe('getAuthError', () => {
  it('session が null のとき 401 を返す', () => {
    const result = getAuthError(null, 'stocks:read');
    expect(result).toEqual({
      message: COMMON_ERROR_MESSAGES.UNAUTHORIZED,
      statusCode: 401,
    });
  });

  it('権限を持たないとき 403 を返す', () => {
    const session = makeSession(['user']);
    const result = getAuthError(session, 'stocks:manage-data');
    expect(result).toEqual({
      message: COMMON_ERROR_MESSAGES.FORBIDDEN,
      statusCode: 403,
    });
  });

  it('権限を持つとき null を返す', () => {
    const session = makeSession(['admin']);
    expect(getAuthError(session, 'stocks:read')).toBeNull();
    expect(getAuthError(session, 'stocks:write-own')).toBeNull();
    expect(getAuthError(session, 'stocks:manage-data')).toBeNull();
  });
});
