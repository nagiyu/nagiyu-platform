/**
 * リダイレクト先 URL の許可判定（オープンリダイレクト対策）
 *
 * 認証フローでは、外部から渡される callbackUrl / リダイレクト URL を
 * 検証せずに遷移先へ用いるとオープンリダイレクトになる。
 * 文字列の前方一致（例: `url.startsWith(baseUrl)` や
 * `/^https?:\/\/[^/]*\.nagiyu\.com/`）は
 * `https://auth.nagiyu.com.evil.com` のようにホスト名の途中に
 * 許可ドメインを含む URL を誤って許可してしまうため使用しない。
 *
 * 本モジュールはフレームワーク非依存・外部依存なしのため、
 * サーバー／クライアント双方から安全に利用できる。
 */

/**
 * リダイレクト先 URL がプラットフォーム内（同一オリジン、または
 * `nagiyu.com` 本体・そのサブドメイン）かを判定する。
 *
 * - URL としてパースできない（相対パス等）→ false
 * - http / https 以外（javascript:, data: 等）→ false
 * - baseUrl と同一オリジン → true
 * - ホスト名が `nagiyu.com` 完全一致、または `.nagiyu.com` 末尾一致 → true
 *
 * @param rawUrl - 検証対象の URL 文字列
 * @param baseUrl - 自サービスのベース URL（同一オリジン判定に使用）
 * @returns 許可される場合 true
 */
export function isAllowedNagiyuRedirectUrl(rawUrl: string, baseUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return false;
  }

  try {
    if (parsed.origin === new URL(baseUrl).origin) {
      return true;
    }
  } catch {
    // baseUrl 自体が不正な場合はホスト名判定に委ねる
  }

  return parsed.hostname === 'nagiyu.com' || parsed.hostname.endsWith('.nagiyu.com');
}
