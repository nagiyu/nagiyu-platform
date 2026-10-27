/**
 * @jest-environment node
 *
 * authConfig.pages のテスト
 *
 * pages.signOut を指定しないと next-auth 既定の英語画面になるため、
 * 日本語のサインアウト確認画面へ差し替わっていることを担保する。
 */

jest.mock('@nagiyu/aws', () => ({
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue({
    handlers: {},
    auth: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));

jest.mock('next-auth/providers/google', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue({}),
}));

jest.mock('@nagiyu/auth-core', () => ({
  createUserRepository: jest.fn().mockReturnValue({}),
}));

describe('authConfig.pages', () => {
  it('サインアウトは日本語の確認画面 /auth/signout に差し替えている', async () => {
    const { authConfig } = await import('@/lib/auth/auth');

    expect(authConfig.pages?.signOut).toBe('/auth/signout');
  });

  it('既存のサインイン・エラー画面の指定を保っている', async () => {
    const { authConfig } = await import('@/lib/auth/auth');

    expect(authConfig.pages?.signIn).toBe('/signin');
    expect(authConfig.pages?.error).toBe('/auth/error');
  });
});
