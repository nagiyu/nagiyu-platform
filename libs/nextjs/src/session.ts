/**
 * テストユーザー解決オプション。
 */
export interface ResolveTestUserOptions {
  /** ロールが未設定の場合に使用する既定ロール一覧。 */
  defaultRoles?: string[];
}

/**
 * テストユーザー情報。
 */
export interface ResolvedTestUser {
  id: string;
  email: string;
  name: string;
  image?: string;
  roles: string[];
}

/**
 * `process.env` からテストユーザー情報を解決する。
 *
 * 各環境変数が未設定の場合は既定値にフォールバックする。
 * `TEST_USER_ROLES` は `,` 区切りで複数ロールを指定できる。
 *
 * @param options - 解決オプション（既定ロールなど）
 * @returns 解決済みテストユーザー情報
 */
export function resolveTestUser(options?: ResolveTestUserOptions): ResolvedTestUser {
  return {
    id: process.env.TEST_USER_ID || 'test-user-id',
    email: process.env.TEST_USER_EMAIL || 'test@example.com',
    name: process.env.TEST_USER_NAME || 'Test User',
    image: process.env.TEST_USER_IMAGE || undefined,
    roles: process.env.TEST_USER_ROLES?.split(',') || options?.defaultRoles || [],
  };
}

interface SessionWithOptionalUser {
  user?: unknown;
}

type SessionWithRequiredUser<TSession extends SessionWithOptionalUser> = TSession & {
  user: NonNullable<TSession['user']>;
};

export interface CreateSessionGetterOptions<
  TAuthSession extends SessionWithOptionalUser,
  TSessionResult = SessionWithRequiredUser<TAuthSession>,
> {
  auth: () => Promise<TAuthSession | null>;
  createTestSession: () => TSessionResult;
  mapSession?: (session: SessionWithRequiredUser<TAuthSession>) => TSessionResult;
}

export function createSessionGetter<
  TAuthSession extends SessionWithOptionalUser,
  TSessionResult = SessionWithRequiredUser<TAuthSession>,
>(options: CreateSessionGetterOptions<TAuthSession, TSessionResult>) {
  const { auth, createTestSession, mapSession } = options;

  return async (): Promise<TSessionResult | null> => {
    if (process.env.SKIP_AUTH_CHECK === 'true') {
      return createTestSession();
    }

    const session = await auth();
    if (!session?.user) {
      return null;
    }

    const sessionWithUser = session as SessionWithRequiredUser<TAuthSession>;
    return mapSession
      ? mapSession(sessionWithUser)
      : (sessionWithUser as unknown as TSessionResult);
  };
}
