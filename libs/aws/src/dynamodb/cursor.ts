/**
 * DynamoDB ページネーション cursor のエンコード／デコードヘルパー
 */

export function encodeCursor(
  lastEvaluatedKey: Record<string, unknown> | undefined
): string | undefined {
  if (!lastEvaluatedKey) return undefined;
  return Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64');
}

/**
 * 無効な cursor（不正な base64 / JSON）は無効カーソルとして `undefined` を返す。
 */
export function decodeCursor(cursor: string | undefined): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
