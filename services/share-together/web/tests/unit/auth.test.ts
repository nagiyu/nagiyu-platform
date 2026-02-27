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
  it('Auth Consumer パターンの最小設定になっている', () => {
    expect(authConfig.providers).toEqual([]);
    expect(authConfig.session?.strategy).toBe('jwt');
    expect(authConfig.cookies?.sessionToken?.name).toContain('__Secure-authjs.session-token');
  });
});
