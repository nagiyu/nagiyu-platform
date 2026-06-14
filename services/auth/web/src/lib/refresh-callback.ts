/**
 * /refresh ページの callbackUrl 解決ロジック
 *
 * auth の redirect コールバック（auth.ts）と同じ許可基準を適用する:
 *   - 同一オリジン（baseUrl で始まる URL）
 *   - *.nagiyu.com 配下の URL
 * 許可されない URL は baseUrl（auth のトップ）にフォールバックする。
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

  // 同一オリジン（baseUrl で始まる URL）は許可
  if (rawCallbackUrl.startsWith(baseUrl)) {
    return rawCallbackUrl;
  }

  // *.nagiyu.com 配下の URL は許可
  if (rawCallbackUrl.match(/^https?:\/\/[^/]*\.nagiyu\.com/)) {
    return rawCallbackUrl;
  }

  // それ以外は baseUrl にフォールバック
  return baseUrl;
}
