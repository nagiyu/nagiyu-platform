import { SignJWT } from 'jose';

/**
 * JWT モック生成オプション
 */
export interface MockJWTOptions {
  /**
   * 有効期限（秒数）
   * 正の値: 現在時刻からの有効期限
   * 負の値: 既に期限切れ（現在時刻 + 負の値）
   * デフォルト: 3600秒（1時間）
   */
  expiresIn?: number;

  /**
   * 発行者 (issuer)
   * デフォルト: 'auth.nagiyu.com'
   */
  issuer?: string;
}

/**
 * JWT ペイロード
 */
export interface JWTPayload {
  userId: string;
  email: string;
  name: string;
  roles: string[];
  picture?: string;
}

/**
 * テスト用の JWT トークンを生成する
 *
 * NextAuth v5 と互換性のある JWT を生成します。
 * テスト環境では固定の秘密鍵を使用します。
 *
 * @param payload - JWT ペイロード
 * @param options - JWT 生成オプション
 * @returns 署名された JWT トークン
 */
export async function generateMockJWT(
  payload: JWTPayload,
  options: MockJWTOptions = {}
): Promise<string> {
  const { expiresIn = 3600, issuer = 'auth.nagiyu.com' } = options;

  // テスト用の秘密鍵（NextAuth のデフォルト形式と同じ）
  const secret = new TextEncoder().encode(
    process.env.NEXTAUTH_SECRET || 'test-secret-key-for-jwt-generation-in-e2e-tests'
  );

  const now = Math.floor(Date.now() / 1000);
  const exp = now + expiresIn;

  // NextAuth v5 の JWT 構造に合わせる
  const jwt = await new SignJWT({
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
    roles: payload.roles,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setIssuer(issuer)
    .sign(secret);

  return jwt;
}

/**
 * デフォルトのテストユーザー情報
 */
export const DEFAULT_TEST_USER: JWTPayload = {
  userId: 'test-user-id-12345',
  email: 'test@example.com',
  name: 'Test User',
  roles: ['admin'],
};

/**
 * ユーザーマネージャー権限を持つテストユーザー
 */
export const USER_MANAGER_TEST_USER: JWTPayload = {
  userId: 'user-manager-id-67890',
  email: 'user-manager@example.com',
  name: 'User Manager',
  roles: ['user-manager'],
};

/**
 * 複数ロールを持つテストユーザー
 */
export const MULTI_ROLE_TEST_USER: JWTPayload = {
  userId: 'multi-role-id-11111',
  email: 'multi-role@example.com',
  name: 'Multi Role User',
  roles: ['admin', 'user-manager'],
};
