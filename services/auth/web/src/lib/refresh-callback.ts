/**
 * /refresh ページの callbackUrl 解決ロジック
 *
 * 許可の判定は auth の戻り先の検証 (sanitizeCallbackUrl) に揃える。
 * 許可されない URL は baseUrl (auth のトップ) にフォールバックする。
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

  return sanitizeCallbackUrl(rawCallbackUrl, baseUrl) ?? baseUrl;
}
