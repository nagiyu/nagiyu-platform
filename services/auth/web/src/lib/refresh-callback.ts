/**
 * /refresh ページの callbackUrl 解決ロジック
 *
 * 許可基準:
 *   - 同一オリジン（baseUrl と同一 origin）
 *   - auth 内の相対パス（絶対 URL に直して返す）
 *   - nagiyu.com 本体、またはそのサブドメイン（*.nagiyu.com）
 * 許可されない URL は baseUrl（auth のトップ）にフォールバックする。
 *
 * 判定は文字列の前方一致ではなく URL パース＋ホスト名一致で行う
 * （前方一致だと `https://auth.nagiyu.com.evil.com` 等のオープンリダイレクトを許すため）。
 */

import { sanitizeCallbackUrl } from './callback-url';

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

  // 許可判定（相対パスの絶対 URL 化を含む）は auth 共通の sanitizeCallbackUrl に委譲する。
  return sanitizeCallbackUrl(rawCallbackUrl, baseUrl) ?? baseUrl;
}
