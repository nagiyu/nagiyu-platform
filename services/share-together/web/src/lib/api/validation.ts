/** 空白のみの文字列を空として扱うため trim 後の長さで判定する。 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * コアのエラーメッセージが入力検証エラーかを判定する。
 *
 * 照合するメッセージ集合は route ごとに異なるため呼び出し側が渡す。
 */
export function isValidationError(error: unknown, messages: ReadonlySet<string>): boolean {
  return error instanceof Error && messages.has(error.message);
}

/**
 * コアのエラーメッセージが対象リソース未存在エラーかを判定する。
 *
 * 照合するメッセージ集合は route ごとに異なるため呼び出し側が渡す。
 */
export function isNotFoundError(error: unknown, messages: ReadonlySet<string>): boolean {
  return error instanceof Error && messages.has(error.message);
}
