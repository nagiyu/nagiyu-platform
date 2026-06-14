/**
 * /refresh ページの callbackUrl 解決ロジック
 *
 * 許可基準:
 *   - 同一オリジン（baseUrl と同一 origin）
 *   - nagiyu.com 本体、またはそのサブドメイン（*.nagiyu.com）
 * 許可されない URL は baseUrl（auth のトップ）にフォールバックする。
 *
 * 判定は文字列の前方一致ではなく URL パース＋ホスト名一致で行う
 * （前方一致だと `https://auth.nagiyu.com.evil.com` 等のオープンリダイレクトを許すため）。
 */

// エラーメッセージ定数
export const ERROR_MESSAGES = {
  INVALID_CALLBACK_URL:
    'callbackUrl が許可されていない URL のため、トップページにフォールバックしました。',
} as const;

/**
 * callbackUrl を検証し、許可された URL を返す。
 * 許可されない場合は baseUrl（auth のトップ）を返す。
 *
 * @param rawCallbackUrl - クエリパラメータから受け取った生の callbackUrl
 * @param baseUrl - auth サービスのベース URL（例: https://auth.nagiyu.com）
 * @returns 遷移先として安全な URL 文字列
 */
export function resolveRefreshCallbackUrl(
  rawCallbackUrl: string | null | undefined,
  baseUrl: string
): string {
  if (!rawCallbackUrl) {
    return baseUrl;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawCallbackUrl);
  } catch {
    // 相対パスやスキーム不正など、絶対 URL としてパースできないものはフォールバック
    return baseUrl;
  }

  // http / https 以外（javascript:, data: 等）はフォールバック
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return baseUrl;
  }

  // 同一オリジンは許可
  try {
    if (parsed.origin === new URL(baseUrl).origin) {
      return rawCallbackUrl;
    }
  } catch {
    // baseUrl 自体が不正な場合は下のホスト名判定に委ねる
  }

  // nagiyu.com 本体、またはそのサブドメイン（ホスト名の完全一致 / 末尾一致）のみ許可
  if (parsed.hostname === 'nagiyu.com' || parsed.hostname.endsWith('.nagiyu.com')) {
    return rawCallbackUrl;
  }

  // それ以外は baseUrl にフォールバック
  return baseUrl;
}
