import { logger } from '../logger/index.js';

export type VapidKeyName = 'publicKey' | 'privateKey';

/**
 * VAPID キー文字列を正規化する。
 *
 * 前後空白・引用符・JSON 文字列（publicKey/privateKey）を許容し、
 * Web Push ライブラリへ渡せる生文字列へ変換する。
 */
export function normalizeVapidKey(rawKey: string, keyName: VapidKeyName): string {
  const trimmedKey = rawKey.trim();
  const unquotedKey =
    (trimmedKey.startsWith('"') && trimmedKey.endsWith('"')) ||
    (trimmedKey.startsWith("'") && trimmedKey.endsWith("'"))
      ? trimmedKey.slice(1, -1).trim()
      : trimmedKey;
  const jsonCandidate = unquotedKey.replace(/\\"/g, '"');

  if (jsonCandidate.startsWith('{') && jsonCandidate.endsWith('}')) {
    try {
      const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>;
      const nestedKey = parsed[keyName];
      if (typeof nestedKey === 'string') {
        return nestedKey.trim();
      }
      logger.warn('VAPID キーJSONに必要なキーが見つかりませんでした', {
        keyName,
        expectedFormat: '{ "publicKey": "...", "privateKey": "..." }',
      });
    } catch (error) {
      logger.warn('VAPID キーのJSON解析に失敗しました。プレーン文字列として処理します', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return unquotedKey;
}
