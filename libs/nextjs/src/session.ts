import { headers } from 'next/headers';

/**
 * テストユーザーのロールをリクエストヘッダで上書きする際に使用するヘッダ名。
 *
 * SKIP_AUTH_CHECK=true のテスト専用経路でのみ参照される（本番の認証経路では読まない）。
 */
export const TEST_USER_ROLES_HEADER = 'x-test-user-roles';

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

/**
 * リクエストヘッダ `x-test-user-roles`（`,` 区切り）からテストユーザーのロールを解決する。
 *
 * `next/headers` の `headers()` はリクエストスコープ外（ビルド・prerender 等）で呼び出すと
 * 例外を投げるため、必ず try/catch で吸収し `undefined` にフォールバックする。
 *
 * @returns ヘッダから解決したロール一覧。ヘッダ未設定・解決不能時は undefined。
 */
async function readRolesFromHeader(): Promise<string[] | undefined> {
  try {
    const headerList = await headers();
    const value = headerList.get(TEST_USER_ROLES_HEADER);
    if (!value) {
      return undefined;
    }

    const roles = value
      .split(',')
      .map((role) => role.trim())
      .filter((role) => role.length > 0);

    return roles.length > 0 ? roles : undefined;
  } catch {
    return undefined;
  }
}

/**
 * テストユーザーのロールを解決する。
 *
 * SKIP_AUTH_CHECK=true のテスト専用経路で使用する。優先順位は以下の通り。
 * 1. リクエストヘッダ `x-test-user-roles`（`,` 区切り）
 * 2. 環境変数 `TEST_USER_ROLES`（`,` 区切り）
 * 3. `options.defaultRoles`
 * 4. 空配列
 *
 * @param options - 解決オプション（既定ロールなど）
 * @returns 解決済みロール一覧
 */
export async function resolveTestUserRoles(options?: ResolveTestUserOptions): Promise<string[]> {
  const headerRoles = await readRolesFromHeader();
  if (headerRoles) {
    return headerRoles;
  }

  return process.env.TEST_USER_ROLES?.split(',') || options?.defaultRoles || [];
}

interface SessionWithOptionalUser {
  user?: unknown;
}

type SessionWithRequiredUser<TSession extends SessionWithOptionalUser> = TSession & {
  user: NonNullable<TSession['user']>;
};

/**
 * `createTestSession` に渡すテストセッションの上書きオプション。
 */
export interface TestSessionOverrides {
  /** リクエストヘッダから解決されたロール一覧。 */
  roles?: string[];
}

export interface CreateSessionGetterOptions<
  TAuthSession extends SessionWithOptionalUser,
  TSessionResult = SessionWithRequiredUser<TAuthSession>,
> {
  auth: () => Promise<TAuthSession | null>;
  /**
   * SKIP_AUTH_CHECK=true 時に呼ばれるテストセッション生成関数。
   *
   * `overrides` はリクエストヘッダ `x-test-user-roles` が設定されている場合のみ渡される。
   * 未設定時は引数なしで呼び出されるため、既存の `() => TSessionResult` 実装もそのまま動作する
   * （後方互換）。
   */
  createTestSession: (overrides?: TestSessionOverrides) => TSessionResult;
  mapSession?: (session: SessionWithRequiredUser<TAuthSession>) => TSessionResult;
}

export function createSessionGetter<
  TAuthSession extends SessionWithOptionalUser,
  TSessionResult = SessionWithRequiredUser<TAuthSession>,
>(options: CreateSessionGetterOptions<TAuthSession, TSessionResult>) {
  const { auth, createTestSession, mapSession } = options;

  return async (): Promise<TSessionResult | null> => {
    if (process.env.SKIP_AUTH_CHECK === 'true') {
      // ヘッダにテスト用ロールが設定されている場合のみ上書きを渡す。
      // 未設定時は従来どおり引数なしで呼び出し、サービス側の env フォールバックに委ねる。
      const headerRoles = await readRolesFromHeader();
      return headerRoles ? createTestSession({ roles: headerRoles }) : createTestSession();
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
