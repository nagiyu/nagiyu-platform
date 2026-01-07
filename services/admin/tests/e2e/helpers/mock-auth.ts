import { Page, BrowserContext } from '@playwright/test';
import {
  generateMockJWT,
  DEFAULT_TEST_USER,
  type JWTPayload,
  type MockJWTOptions,
} from './jwt-utils';

/**
 * モック JWT をクッキーにセットする
 *
 * Admin サービスがアクセスできる JWT クッキーを設定します。
 * NextAuth v5 のクッキー命名規則に従います。
 *
 * @param page - Playwright Page オブジェクト
 * @param payload - JWT ペイロード（省略時はデフォルトユーザー）
 * @param options - JWT 生成オプション
 */
export async function setMockJWT(
  page: Page,
  payload: JWTPayload = DEFAULT_TEST_USER,
  options: MockJWTOptions = {}
): Promise<void> {
  const jwt = await generateMockJWT(payload, options);

  // NextAuth v5 のセッショントークンクッキー名
  // 本番環境 (HTTPS): __Secure-next-auth.session-token
  // 開発環境 (HTTP): next-auth.session-token
  const isSecure = process.env.NODE_ENV === 'production' || process.env.CI === 'true';
  const cookieName = isSecure ? '__Secure-next-auth.session-token' : 'next-auth.session-token';

  await page.context().addCookies([
    {
      name: cookieName,
      value: jwt,
      domain: 'localhost', // ローカルテストでは localhost
      path: '/',
      httpOnly: true,
      secure: isSecure,
      sameSite: 'Lax',
    },
  ]);
}

/**
 * 期限切れのモック JWT をクッキーにセットする
 *
 * JWT の期限切れ動作をテストするために、
 * 既に期限切れとなった JWT をセットします。
 *
 * @param page - Playwright Page オブジェクト
 * @param payload - JWT ペイロード（省略時はデフォルトユーザー）
 */
export async function setExpiredJWT(
  page: Page,
  payload: JWTPayload = DEFAULT_TEST_USER
): Promise<void> {
  // 1時間前に期限切れ
  await setMockJWT(page, payload, { expiresIn: -3600 });
}

/**
 * Auth サービスの Google OAuth ログインをモックする
 *
 * Note: 現在の実装では、単純に JWT クッキーをセットするだけです。
 * 実際の OAuth フローをモックする必要がある場合は、
 * MSW (Mock Service Worker) などを使用して拡張できます。
 *
 * context パラメータは将来の拡張のために保持されています。
 * MSW やその他のブラウザコンテキストレベルのモックを実装する際に使用します。
 *
 * @param page - Playwright Page オブジェクト
 * @param context - Playwright BrowserContext オブジェクト (将来の拡張用)
 * @param payload - JWT ペイロード（省略時はデフォルトユーザー）
 */
export async function mockGoogleOAuthLogin(
  page: Page,
  context: BrowserContext,
  payload: JWTPayload = DEFAULT_TEST_USER
): Promise<void> {
  // JWT をセットして認証済み状態にする
  await setMockJWT(page, payload);
}

/**
 * すべての認証クッキーをクリアする
 *
 * ログアウト後の状態をシミュレートします。
 *
 * @param page - Playwright Page オブジェクト
 */
export async function clearAuthCookies(page: Page): Promise<void> {
  const context = page.context();
  const cookies = await context.cookies();

  // NextAuth 関連のクッキーをすべて削除
  const authCookies = cookies.filter(
    (cookie) =>
      cookie.name.includes('next-auth') ||
      cookie.name.includes('__Secure-next-auth') ||
      cookie.name.includes('__Host-next-auth')
  );

  for (const cookie of authCookies) {
    await context.clearCookies({
      name: cookie.name,
      domain: cookie.domain,
    });
  }
}

/**
 * テストユーザー定数を再エクスポート
 * テストファイルでのインポートを統一するため
 */
export { DEFAULT_TEST_USER, USER_MANAGER_TEST_USER, MULTI_ROLE_TEST_USER } from './jwt-utils';
