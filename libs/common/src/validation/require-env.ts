const ERROR_MESSAGES = {
  MISSING_ENV: '必要な環境変数が設定されていません',
} as const;

/**
 * 必須環境変数を一括取得する。
 *
 * - 空文字列も「未設定」とみなす（`?.trim() ?? ''` 挙動を踏襲）
 * - 不足キーを一括収集して `必要な環境変数が設定されていません: KEY1, KEY2` でスロー
 */
export function requireEnv(keys: string[]): Record<string, string> {
  const missing: string[] = [];
  const result: Record<string, string> = {};

  for (const key of keys) {
    const value = process.env[key]?.trim() ?? '';
    if (value.length === 0) {
      missing.push(key);
    } else {
      result[key] = value;
    }
  }

  if (missing.length > 0) {
    throw new Error(`${ERROR_MESSAGES.MISSING_ENV}: ${missing.join(', ')}`);
  }

  return result;
}
