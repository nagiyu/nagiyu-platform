/**
 * サインイン画面に表示するエラー文の引き当て。
 *
 * クエリ文字列の値をそのままオブジェクトのキーにすると、`__proto__` や
 * `constructor` のように Object 自身が持つプロパティを拾ってしまう。
 * このため自前のキーだけを対象にし、それ以外は既定の文にする。
 */

export const SIGNIN_ERROR_MESSAGES = {
  OAuthCallbackError: 'Google での認証が完了しませんでした。もう一度お試しください。',
  MissingCSRF: '操作の確認に失敗しました。画面を開き直してから、もう一度お試しください。',
  Configuration: 'サーバー設定に問題があります。管理者にお問い合わせください。',
  Default: 'サインインに失敗しました。もう一度お試しください。',
} as const;

/**
 * エラーコードに対応する表示文を返す。
 *
 * @param error - クエリパラメータから受け取った生のエラーコード
 * @returns 表示する文。error が無い (undefined / 空文字) ときは表示しないことを示す null。
 *   既知のコード以外は既定の文
 */
export function resolveSigninErrorMessage(error: string | null | undefined): string | null {
  if (typeof error !== 'string' || error === '') {
    return null;
  }
  if (Object.hasOwn(SIGNIN_ERROR_MESSAGES, error) && error !== 'Default') {
    return SIGNIN_ERROR_MESSAGES[error as keyof typeof SIGNIN_ERROR_MESSAGES];
  }
  return SIGNIN_ERROR_MESSAGES.Default;
}
