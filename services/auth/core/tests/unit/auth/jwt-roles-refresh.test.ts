/**
 * jwt コールバックのロール再取得（TTL ゲート・強制リフレッシュ）テスト
 *
 * テスト対象:
 *   - ログイン時に rolesRefreshedAt が設定される
 *   - rolesRefreshedAt が TTL より古い → getUserByGoogleId が呼ばれ roles が更新される
 *   - trigger === 'update' → TTL に関わらず強制再取得される
 *   - rolesRefreshedAt が新しい（TTL 内）かつ trigger なし → 再取得されない
 *   - DB エラー時に例外を投げず token をそのまま返す
 */

import { reportErrorEvent } from '@nagiyu/aws';

type AnyAsyncFn = (...args: unknown[]) => Promise<Record<string, unknown>>;

const capturedCallbacks: { jwt?: AnyAsyncFn } = {};
const mockGetUserByGoogleId = jest.fn();
const mockUpdateLastLogin = jest.fn();

jest.mock('@nagiyu/aws', () => ({
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('@nagiyu/nextjs', () => ({
  createAuthConfig: jest.fn().mockImplementation(({ jwt }: { jwt: AnyAsyncFn }) => {
    capturedCallbacks.jwt = jwt;
    return { callbacks: {} };
  }),
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

jest.mock('../../../src/repositories/factory', () => ({
  createUserRepository: jest.fn().mockReturnValue({
    getUserByGoogleId: mockGetUserByGoogleId,
    updateLastLogin: mockUpdateLastLogin,
    upsertUser: jest.fn().mockResolvedValue({ userId: 'user-123' }),
  }),
}));

/** 5 分（TTL）= 300_000 ms */
const TTL_MS = 5 * 60 * 1000;

describe('jwt コールバック - rolesRefreshedAt', () => {
  beforeAll(async () => {
    await import('../../../src/auth/auth');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (reportErrorEvent as jest.Mock).mockResolvedValue(null);
    mockGetUserByGoogleId.mockResolvedValue(null);
    mockUpdateLastLogin.mockResolvedValue(undefined);
  });

  describe('ログイン時（account && user）', () => {
    it('rolesRefreshedAt が設定される', async () => {
      const now = Date.now();
      mockGetUserByGoogleId.mockResolvedValueOnce({ userId: 'u1', roles: ['admin'] });
      mockUpdateLastLogin.mockResolvedValueOnce(undefined);

      const { createUserRepository } = await import('../../../src/repositories/factory');
      (createUserRepository as jest.Mock).mockReturnValueOnce({
        getUserByGoogleId: mockGetUserByGoogleId,
        updateLastLogin: mockUpdateLastLogin,
      });

      const token = {};
      const result = await capturedCallbacks.jwt!({
        token,
        user: { email: 'test@example.com', name: 'Test' },
        account: { providerAccountId: 'google-123' },
      });

      expect(typeof result.rolesRefreshedAt).toBe('number');
      expect(result.rolesRefreshedAt as number).toBeGreaterThanOrEqual(now);
    });

    it('ログイン時は roles も設定される', async () => {
      mockGetUserByGoogleId.mockResolvedValueOnce({ userId: 'u1', roles: ['admin', 'viewer'] });
      mockUpdateLastLogin.mockResolvedValueOnce(undefined);

      const { createUserRepository } = await import('../../../src/repositories/factory');
      (createUserRepository as jest.Mock).mockReturnValueOnce({
        getUserByGoogleId: mockGetUserByGoogleId,
        updateLastLogin: mockUpdateLastLogin,
      });

      const token = {};
      const result = await capturedCallbacks.jwt!({
        token,
        user: { email: 'test@example.com', name: 'Test' },
        account: { providerAccountId: 'google-123' },
      });

      expect(result.roles).toEqual(['admin', 'viewer']);
      expect(result.userId).toBe('u1');
    });
  });

  describe('ログイン以外の呼び出し - TTL ゲート', () => {
    it('rolesRefreshedAt が TTL より古い場合、getUserByGoogleId が呼ばれ roles が更新される', async () => {
      const oldTimestamp = Date.now() - TTL_MS - 1000;
      const mockDbUser = { userId: 'u2', roles: ['manager'] };
      mockGetUserByGoogleId.mockResolvedValueOnce(mockDbUser);

      const { createUserRepository } = await import('../../../src/repositories/factory');
      (createUserRepository as jest.Mock).mockReturnValueOnce({
        getUserByGoogleId: mockGetUserByGoogleId,
        updateLastLogin: mockUpdateLastLogin,
      });

      const token = {
        googleId: 'google-456',
        roles: ['old-role'],
        rolesRefreshedAt: oldTimestamp,
      };
      const result = await capturedCallbacks.jwt!({ token });

      expect(mockGetUserByGoogleId).toHaveBeenCalledWith('google-456');
      expect(result.roles).toEqual(['manager']);
      expect(result.userId).toBe('u2');
      expect(typeof result.rolesRefreshedAt).toBe('number');
      expect(result.rolesRefreshedAt as number).toBeGreaterThan(oldTimestamp);
    });

    it('rolesRefreshedAt が TTL 内（新しい）かつ trigger なしの場合、再取得されない', async () => {
      const recentTimestamp = Date.now() - 1000; // 1 秒前（TTL 5 分以内）

      const { createUserRepository } = await import('../../../src/repositories/factory');
      (createUserRepository as jest.Mock).mockReturnValueOnce({
        getUserByGoogleId: mockGetUserByGoogleId,
        updateLastLogin: mockUpdateLastLogin,
      });

      const token = {
        googleId: 'google-789',
        roles: ['existing-role'],
        rolesRefreshedAt: recentTimestamp,
      };
      const result = await capturedCallbacks.jwt!({ token });

      expect(mockGetUserByGoogleId).not.toHaveBeenCalled();
      expect(result.roles).toEqual(['existing-role']);
    });

    it('rolesRefreshedAt が未設定の場合（初回 TTL チェック）、再取得される', async () => {
      mockGetUserByGoogleId.mockResolvedValueOnce({ userId: 'u3', roles: ['viewer'] });

      const { createUserRepository } = await import('../../../src/repositories/factory');
      (createUserRepository as jest.Mock).mockReturnValueOnce({
        getUserByGoogleId: mockGetUserByGoogleId,
        updateLastLogin: mockUpdateLastLogin,
      });

      // rolesRefreshedAt なし → Date.now() - 0 > TTL_MS → 再取得される
      const token = { googleId: 'google-000' };
      const result = await capturedCallbacks.jwt!({ token });

      expect(mockGetUserByGoogleId).toHaveBeenCalledWith('google-000');
      expect(result.roles).toEqual(['viewer']);
    });
  });

  describe('trigger === "update"（強制リフレッシュ）', () => {
    it('trigger が "update" のとき TTL に関わらず getUserByGoogleId が呼ばれる', async () => {
      const recentTimestamp = Date.now() - 1000; // TTL 内でも強制再取得される
      mockGetUserByGoogleId.mockResolvedValueOnce({ userId: 'u4', roles: ['super-admin'] });

      const { createUserRepository } = await import('../../../src/repositories/factory');
      (createUserRepository as jest.Mock).mockReturnValueOnce({
        getUserByGoogleId: mockGetUserByGoogleId,
        updateLastLogin: mockUpdateLastLogin,
      });

      const token = {
        googleId: 'google-999',
        roles: ['old-role'],
        rolesRefreshedAt: recentTimestamp,
      };
      const result = await capturedCallbacks.jwt!({ token, trigger: 'update' });

      expect(mockGetUserByGoogleId).toHaveBeenCalledWith('google-999');
      expect(result.roles).toEqual(['super-admin']);
    });

    it('trigger が "update" のとき rolesRefreshedAt が更新される', async () => {
      const recentTimestamp = Date.now() - 1000;
      mockGetUserByGoogleId.mockResolvedValueOnce({ userId: 'u5', roles: [] });

      const { createUserRepository } = await import('../../../src/repositories/factory');
      (createUserRepository as jest.Mock).mockReturnValueOnce({
        getUserByGoogleId: mockGetUserByGoogleId,
        updateLastLogin: mockUpdateLastLogin,
      });

      const token = {
        googleId: 'google-111',
        roles: ['old-role'],
        rolesRefreshedAt: recentTimestamp,
      };
      const result = await capturedCallbacks.jwt!({ token, trigger: 'update' });

      expect(result.rolesRefreshedAt as number).toBeGreaterThan(recentTimestamp);
    });
  });

  describe('DB ユーザーが見つからない場合', () => {
    it('dbUser が null でも rolesRefreshedAt だけ更新し例外を投げない', async () => {
      const oldTimestamp = Date.now() - TTL_MS - 1000;
      mockGetUserByGoogleId.mockResolvedValueOnce(null);

      const { createUserRepository } = await import('../../../src/repositories/factory');
      (createUserRepository as jest.Mock).mockReturnValueOnce({
        getUserByGoogleId: mockGetUserByGoogleId,
        updateLastLogin: mockUpdateLastLogin,
      });

      const token = {
        googleId: 'google-404',
        roles: ['existing-role'],
        rolesRefreshedAt: oldTimestamp,
      };
      const result = await capturedCallbacks.jwt!({ token });

      // 既存 roles は変わらない
      expect(result.roles).toEqual(['existing-role']);
      // rolesRefreshedAt は更新される（次回の無駄な再取得を防ぐ）
      expect(result.rolesRefreshedAt as number).toBeGreaterThan(oldTimestamp);
      // 例外なし
    });
  });

  describe('DB エラー時', () => {
    it('DB エラー時は例外を投げず既存 token をそのまま返す', async () => {
      const oldTimestamp = Date.now() - TTL_MS - 1000;
      mockGetUserByGoogleId.mockRejectedValueOnce(new Error('DynamoDB 接続エラー'));

      const { createUserRepository } = await import('../../../src/repositories/factory');
      (createUserRepository as jest.Mock).mockReturnValueOnce({
        getUserByGoogleId: mockGetUserByGoogleId,
        updateLastLogin: mockUpdateLastLogin,
      });

      const token = {
        googleId: 'google-err',
        roles: ['safe-role'],
        rolesRefreshedAt: oldTimestamp,
      };

      await expect(capturedCallbacks.jwt!({ token })).resolves.not.toThrow();

      const result = await capturedCallbacks.jwt!({
        token: { ...token },
        // 2 回目は createUserRepository を再設定する必要があるため、
        // 上記 resolves で検証済みのため、別途エラーなく返却されたことのみ確認する
      });

      // googleId がなければ再取得ロジックに入らない（token をそのまま返す）
      expect(result).toMatchObject({ googleId: 'google-err', roles: ['safe-role'] });
    });

    it('DB エラー時は reportErrorEvent が呼ばれる', async () => {
      const oldTimestamp = Date.now() - TTL_MS - 1000;
      const dbError = new Error('DynamoDB タイムアウト');
      mockGetUserByGoogleId.mockRejectedValueOnce(dbError);

      const { createUserRepository } = await import('../../../src/repositories/factory');
      (createUserRepository as jest.Mock).mockReturnValueOnce({
        getUserByGoogleId: mockGetUserByGoogleId,
        updateLastLogin: mockUpdateLastLogin,
      });

      const token = {
        googleId: 'google-err2',
        roles: ['current-role'],
        rolesRefreshedAt: oldTimestamp,
      };

      await capturedCallbacks.jwt!({ token });

      expect(reportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'auth',
          severity: 'error',
        })
      );
    });

    it('DB エラー時は既存の roles が維持される', async () => {
      const oldTimestamp = Date.now() - TTL_MS - 1000;
      mockGetUserByGoogleId.mockRejectedValueOnce(new Error('DB unavailable'));

      const { createUserRepository } = await import('../../../src/repositories/factory');
      (createUserRepository as jest.Mock).mockReturnValueOnce({
        getUserByGoogleId: mockGetUserByGoogleId,
        updateLastLogin: mockUpdateLastLogin,
      });

      const token = {
        googleId: 'google-err3',
        roles: ['preserved-role'],
        rolesRefreshedAt: oldTimestamp,
      };

      const result = await capturedCallbacks.jwt!({ token });

      expect(result.roles).toEqual(['preserved-role']);
    });
  });

  describe('googleId がない場合', () => {
    it('googleId がなければ再取得ロジックに入らず token をそのまま返す', async () => {
      const token = { roles: ['some-role'], email: 'test@example.com' };
      const result = await capturedCallbacks.jwt!({ token });

      expect(mockGetUserByGoogleId).not.toHaveBeenCalled();
      expect(result).toEqual(token);
    });
  });
});
