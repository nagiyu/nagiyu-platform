import { isAllowedNagiyuRedirectUrl } from '@nagiyu/common';

/**
 * プランの画面と課金の API が受け取る戻り先を検証する。
 *
 * 許可するのは nagiyu.com 配下 (dev を含む) と自サービスの URL、auth 内の相対パス。
 * 相対パスは `//host` や `/\host` のように別オリジンを指せる形を弾いたうえで、絶対 URL に直す。
 * `/refresh` が絶対 URL しか許可しないため、呼び出し側で扱いを分けなくて済むようにそろえる。
 *
 * @param rawCallbackUrl - クエリや body から受け取った生の値
 * @param baseUrl - auth の URL
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
      return new URL(rawCallbackUrl, baseUrl).toString();
    } catch {
      return null;
    }
  }

  return isAllowedNagiyuRedirectUrl(rawCallbackUrl, baseUrl) ? rawCallbackUrl : null;
}
