import { isAllowedNagiyuRedirectUrl } from '@nagiyu/common';

/**
 * 戻り先を検証する。許可するのは nagiyu.com 配下 (dev を含む) と自サービスの URL、auth 内の相対パス。
 * 相対パスは絶対 URL に直して返す (`/refresh` が絶対 URL しか許可しないため)。
 *
 * @returns 安全な絶対 URL。無い・許可されない値は null
 */
export function sanitizeCallbackUrl(
  rawCallbackUrl: string | null | undefined,
  baseUrl: string
): string | null {
  if (!rawCallbackUrl) {
    return null;
  }

  if (rawCallbackUrl.startsWith('/')) {
    if (rawCallbackUrl.startsWith('//') || rawCallbackUrl.includes('\\')) {
      return null;
    }
    try {
      // WHATWG の URL パーサーはタブと改行を黙って取り除くため、`/\t/host` が別オリジンの
      // `//host` になる。文字列の検査では防げないので、解決後のオリジンで確かめる
      const resolved = new URL(rawCallbackUrl, baseUrl);
      return resolved.origin === new URL(baseUrl).origin ? resolved.toString() : null;
    } catch {
      return null;
    }
  }

  return isAllowedNagiyuRedirectUrl(rawCallbackUrl, baseUrl) ? rawCallbackUrl : null;
}

/** サインイン画面で、戻り先が無い・使えないときに移す先 */
export const SIGNED_IN_FALLBACK_PATH = '/dashboard';

const SIGN_IN_PATH = '/signin';

/**
 * ログイン済みでサインイン画面を開いた利用者を移す先を決める。
 * 戻り先がサインイン画面自身だと、移った先でまた移り続けるため、既定の先へ倒す。
 *
 * @returns 許可された絶対 URL か {@link SIGNED_IN_FALLBACK_PATH}
 */
export function resolveSignedInDestination(
  rawCallbackUrl: string | null | undefined,
  baseUrl: string
): string {
  const destination = sanitizeCallbackUrl(rawCallbackUrl, baseUrl);
  if (!destination) {
    return SIGNED_IN_FALLBACK_PATH;
  }
  const url = new URL(destination);
  const isSignInPage =
    url.origin === new URL(baseUrl).origin &&
    (url.pathname === SIGN_IN_PATH || url.pathname.startsWith(`${SIGN_IN_PATH}/`));
  return isSignInPage ? SIGNED_IN_FALLBACK_PATH : destination;
}
