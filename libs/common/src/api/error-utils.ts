export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 任意のエラーオブジェクトからユーザー向けメッセージを抽出するヘルパー。
 *
 * - `errorData.message` (string) があればそれを返す
 * - 無ければ `errorData.error.message` (string) を返す
 * - どちらも無ければ `defaultMessage` を返す
 */
export function extractErrorMessage(errorData: unknown, defaultMessage: string): string {
  if (typeof errorData !== 'object' || errorData === null) {
    return defaultMessage;
  }

  const candidate = errorData as {
    message?: unknown;
    error?: {
      message?: unknown;
    };
  };

  if (typeof candidate.message === 'string') {
    return candidate.message;
  }

  if (typeof candidate.error?.message === 'string') {
    return candidate.error.message;
  }

  return defaultMessage;
}
