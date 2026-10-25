import { isAllowedNagiyuRedirectUrl } from '@nagiyu/common';

/**
 * サインアウト確認画面の「キャンセル」の戻り先を解決するロジック。
 *
 * next-auth はサインアウト要求時に検証済みの callbackUrl を Cookie に保存してから
 * 確認画面へ遷移させる。確認画面はクエリを受け取れないため、戻り先は Cookie から復元する。
 */

/** callbackUrl Cookie を読めない・不正なときの戻り先 */
export const DEFAULT_CANCEL_URL = '/dashboard';

/**
 * authConfig に Cookie 名の指定が無いときの next-auth 既定の名前。
 * 実際の名前は共通の認証設定がローカルを含む全環境で決めており、この値は
 * authConfig 側の指定が外れたときに備える保険として使う。
 */
export const FALLBACK_CALLBACK_URL_COOKIE_NAME = 'authjs.callback-url';

/** リクエストの Origin を組み立てられないときのフォールバック */
export const FALLBACK_BASE_URL = 'http://localhost';

/** Cookie ストアのうち、この lib が使う最小の読み取りインターフェース */
export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

/** ヘッダーストアのうち、この lib が使う最小の読み取りインターフェース */
export interface HeaderReader {
  get(name: string): string | null;
}

/**
 * 自サービスの Origin を解決する。
 *
 * next-auth が callbackUrl Cookie を検証した基準は AUTH_URL (無ければ NEXTAUTH_URL) の
 * origin なので、再検証も同じ基準に揃える。CloudFront 配下では Host が Lambda Function URL
 * などの内部ホストになりうるため、環境変数を優先し、無いときだけヘッダーから組み立てる。
 * 同一オリジン判定にしか使わないので、ヘッダーも無ければ判定が成立しない値に倒す。
 *
 * @param headers - リクエストヘッダー
 * @param env - 環境変数。テストで差し替えるために受け取る
 * @returns `https://auth.nagiyu.com` のような Origin
 */
export function resolveBaseUrl(
  headers: HeaderReader,
  env: Record<string, string | undefined> = process.env
): string {
  const configuredUrl = env.AUTH_URL || env.NEXTAUTH_URL;
  if (configuredUrl) {
    try {
      return new URL(configuredUrl).origin;
    } catch {
      // 不正な値は無視してヘッダーからの組み立てにフォールバックする
    }
  }

  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!host) {
    return FALLBACK_BASE_URL;
  }
  // 複数段のプロキシを経ると値がカンマ区切りになるため、最初の値 (クライアントに最も近い値) を使う
  const firstHost = host.split(',')[0].trim();
  const protocol = (headers.get('x-forwarded-proto') ?? 'https').split(',')[0].trim();
  return `${protocol}://${firstHost}`;
}

/**
 * callbackUrl Cookie の値を再検証し、キャンセル時の戻り先を返す。
 *
 * Cookie は兄弟ドメインから書き換えうるため、保存済みであることを根拠にせず、
 * 遷移の直前に改めて許可判定をかける。
 *
 * @param rawCallbackUrl - Cookie の生の値
 * @param baseUrl - 自サービスの Origin
 * @returns 遷移先として安全な URL。読めない・不正なら {@link DEFAULT_CANCEL_URL}
 */
export function resolveCancelUrl(
  rawCallbackUrl: string | null | undefined,
  baseUrl: string
): string {
  if (!rawCallbackUrl) {
    return DEFAULT_CANCEL_URL;
  }
  return isAllowedNagiyuRedirectUrl(rawCallbackUrl, baseUrl) ? rawCallbackUrl : DEFAULT_CANCEL_URL;
}

/**
 * サインアウト確認画面のキャンセル戻り先を、リクエストの Cookie とヘッダーから解決する。
 *
 * @param cookies - リクエストの Cookie
 * @param headers - リクエストのヘッダー
 * @param cookieName - callbackUrl Cookie の名前。環境ごとに異なるため authConfig の値を渡す
 * @param env - 環境変数。テストで差し替えるために受け取る
 * @returns キャンセル時の戻り先 URL
 */
export function resolveCancelUrlFromRequest(
  cookies: CookieReader,
  headers: HeaderReader,
  cookieName: string | undefined,
  env: Record<string, string | undefined> = process.env
): string {
  const name = cookieName ?? FALLBACK_CALLBACK_URL_COOKIE_NAME;
  return resolveCancelUrl(cookies.get(name)?.value, resolveBaseUrl(headers, env));
}
