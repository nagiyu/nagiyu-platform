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
