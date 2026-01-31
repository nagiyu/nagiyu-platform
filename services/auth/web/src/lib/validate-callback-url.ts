/**
 * callbackUrl 検証ユーティリティ
 * 
 * オープンリダイレクト攻撃を防ぐため、callbackUrl を検証する
 */

// デフォルトのコールバック URL
export const DEFAULT_CALLBACK_URL = '/dashboard';

/**
 * callbackUrl を検証し、安全な URL のみを許可する
 * NextAuth の redirect callback と同じロジックを使用
 * 
 * @param callbackUrl - 検証する URL
 * @param baseUrl - ベース URL（同じドメインの場合は許可）
 * @returns 検証済みの安全な URL
 */
export function validateCallbackUrl(callbackUrl: string, baseUrl: string): string {
  // 同じドメインへのリダイレクトを許可
  if (callbackUrl.startsWith(baseUrl)) {
    return callbackUrl;
  }
  
  // 相対パスを許可
  if (callbackUrl.startsWith('/')) {
    return callbackUrl;
  }
  
  // プラットフォーム内のサービス (*.nagiyu.com) へのリダイレクトを許可
  // 末尾をアンカーして、nagiyu.com で終わることを保証
  // 例: https://dev-niconico-mylist-assistant.nagiyu.com/
  if (callbackUrl.match(/^https?:\/\/[^/]*\.nagiyu\.com(\/.*)?$/)) {
    return callbackUrl;
  }
  
  // 外部 URL は拒否してデフォルト URL にフォールバック
  return DEFAULT_CALLBACK_URL;
}
