/**
 * 認証エラーページに表示するメッセージの引き当て。
 *
 * クエリ文字列の値をそのままオブジェクトのキーにすると、`__proto__` や
 * `constructor` のように Object 自身が持つプロパティを拾ってしまう。
 * このため自前のキーだけを対象にし、それ以外は既定のメッセージにする。
 */

export const AUTH_ERROR_MESSAGES = {
  Configuration: 'サーバー設定に問題があります。管理者にお問い合わせください。',
  AccessDenied: 'アクセスが拒否されました。',
  Verification: '認証トークンの有効期限が切れています。',
  Default: '認証中にエラーが発生しました。もう一度お試しください。',
} as const;

/**
 * エラーコードに対応する表示メッセージを返す。
 *
 * @param error - クエリパラメータから受け取った生のエラーコード
 * @returns 既知のコードなら対応するメッセージ、それ以外は既定のメッセージ
 */
export function resolveAuthErrorMessage(error: string | null | undefined): string {
  if (typeof error === 'string' && Object.hasOwn(AUTH_ERROR_MESSAGES, error)) {
    return AUTH_ERROR_MESSAGES[error as keyof typeof AUTH_ERROR_MESSAGES];
  }
  return AUTH_ERROR_MESSAGES.Default;
}
