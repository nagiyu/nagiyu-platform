import { headers } from 'next/headers';
import type { Session } from '@nagiyu/common';

/**
 * テストユーザーのロールをリクエストヘッダで上書きする際に使用するヘッダ名。
 *
 * SKIP_AUTH_CHECK=true のテスト専用経路でのみ参照される（本番の認証経路では読まない）。
 */
export const TEST_USER_ROLES_HEADER = 'x-test-user-roles';

/**
 * テストセッションの有効期限（ミリ秒）。
 *
 * E2E や長時間の手動確認の途中でセッションが切れないよう、全サービスで 30 日に揃える。
 */
export const TEST_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * テストセッションの有効期限（ISO 8601 文字列）を現在時刻から生成する。
 *
 * @returns 30 日後の ISO 8601 文字列
 */
export function createTestSessionExpires(): string {
  return new Date(Date.now() + TEST_SESSION_TTL_MS).toISOString();
}

/**
 * `,` 区切りのロール文字列を解析する。
 *
 * 環境変数 `TEST_USER_ROLES` とヘッダ `x-test-user-roles` で同じ解釈になるよう、
 * 分割・trim・空要素除去をここに集約する。
 *
 * @param value - `,` 区切りのロール文字列
 * @returns ロール一覧。未指定・空・空要素のみの場合は undefined（未設定扱い）
 */
export function parseTestUserRoles(value: string | null | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const roles = value
    .split(',')
    .map((role) => role.trim())
    .filter((role) => role.length > 0);

  return roles.length > 0 ? roles : undefined;
}

/**
 * テストユーザー解決オプション。
 */
export interface ResolveTestUserOptions {
  /** ロールが未設定の場合に使用する既定ロール一覧。 */
  defaultRoles?: string[];
  /** リクエストヘッダ由来のロール。指定時は `TEST_USER_ROLES` より優先される。 */
  roles?: string[];
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
 * ロールの優先順位は `options.roles`（ヘッダ由来）、`TEST_USER_ROLES`、`options.defaultRoles` の順。
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
    roles:
      (options?.roles && options.roles.length > 0 ? options.roles : undefined) ??
      parseTestUserRoles(process.env.TEST_USER_ROLES) ??
      options?.defaultRoles ??
      [],
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
    return parseTestUserRoles(headerList.get(TEST_USER_ROLES_HEADER));
  } catch {
    return undefined;
  }
}

/**
 * テストセッションを組み立てる。
 *
 * サーバー側の `getSession()` とクライアント向け `/api/auth/session` が同じ解決規則
 * (ヘッダ → `TEST_USER_ROLES` → 既定ロール) で同じ形を返すよう、組み立てをここに集約する。
 *
 * @param options - 既定ロールとヘッダ由来のロール
 * @returns テストセッション
 */
function buildTestSession(options?: ResolveTestUserOptions): Session {
  const user = resolveTestUser(options);
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      roles: user.roles,
    },
    expires: createTestSessionExpires(),
  };
}

/**
 * `createSessionGetter` のオプション。
 */
export interface CreateSessionGetterOptions {
  /**
   * next-auth の `auth`。
   *
   * `auth` は middleware 用のオーバーロードを持ち、そのままでは代入できないため、
   * 呼び出し側で `auth as () => Promise<Session | null>` と絞って渡す。
   */
  auth: () => Promise<Session | null>;
  /** `SKIP_AUTH_CHECK=true` のテストセッションでロールが未設定の場合に使う既定ロール。 */
  defaultRoles?: string[];
}

/**
 * サーバー側のセッション取得関数を作る。
 *
 * 戻り値はサービスによらず `@nagiyu/common` の `Session` で揃える。
 * `SKIP_AUTH_CHECK=true` のときは `auth()` を呼ばず、ヘッダ `x-test-user-roles` →
 * `TEST_USER_ROLES` → `defaultRoles` の順でロールを解決したテストセッションを返す。
 *
 * @param options - `auth` と既定ロール
 * @returns 未認証の場合は null を返すセッション取得関数
 */
export function createSessionGetter(options: CreateSessionGetterOptions) {
  const { auth, defaultRoles } = options;

  return async (): Promise<Session | null> => {
    if (process.env.SKIP_AUTH_CHECK === 'true') {
      const roles = await readRolesFromHeader();
      return buildTestSession({ defaultRoles, roles });
    }

    const session = await auth();
    if (!session?.user) {
      return null;
    }

    return session;
  };
}

/**
 * クライアント向けセッション API のパス。
 *
 * next-auth/react の `useSession()` がこのパスを fetch する。
 */
const CLIENT_SESSION_PATH = '/api/auth/session';

/**
 * `createClientSessionGetHandler` のオプション。
 */
export interface CreateClientSessionGetHandlerOptions {
  /** ロールが未設定の場合に使用する既定ロール一覧。サーバー側の `createSessionGetter` の `defaultRoles` と揃える。 */
  defaultRoles?: string[];
}

/**
 * next-auth の `handlers.GET` を包み、`SKIP_AUTH_CHECK=true` のときだけ
 * `/api/auth/session` にテストセッションを返す GET ハンドラを作る。
 *
 * サーバー側の `getSession()` だけがヘッダでロールを差し替えられると、クライアントの
 * `useSession()` との間でロールの見え方が食い違うため、同じ解決規則（ヘッダ → `TEST_USER_ROLES`
 * → 既定ロール）で応答する。判定を本ヘルパーに閉じ込め、本番経路には影響させない。
 *
 * @param originalGet - 元の `handlers.GET`
 * @param options - 既定ロールなど
 * @returns 差し替え済みの GET ハンドラ
 */
export function createClientSessionGetHandler<TRequest extends Request>(
  originalGet: (req: TRequest) => Response | Promise<Response>,
  options?: CreateClientSessionGetHandlerOptions
): (req: TRequest) => Promise<Response> {
  return async (req: TRequest): Promise<Response> => {
    if (
      process.env.SKIP_AUTH_CHECK === 'true' &&
      new URL(req.url).pathname === CLIENT_SESSION_PATH
    ) {
      const session = buildTestSession({
        defaultRoles: options?.defaultRoles,
        roles: parseTestUserRoles(req.headers.get(TEST_USER_ROLES_HEADER)),
      });
      // next-auth の useSession() は image 未設定を null として受け取る前提のため揃える。
      return Response.json({
        ...session,
        user: { ...session.user, image: session.user.image ?? null },
      });
    }

    return originalGet(req);
  };
}
