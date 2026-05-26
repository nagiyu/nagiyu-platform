/**
 * Single Table 設計の PK / SK を組み立てるための共通ヘルパー。
 *
 * 設計は `tasks/livetalk/design.md` 3.2 節「SK パターン一覧」に準拠する。
 * PK は全エンティティで `USER#<googleId>` に統一する。
 */

export function buildUserPK(userId: string): string {
  return `USER#${userId}`;
}

export function buildProfileSK(): string {
  return 'PROFILE';
}

export function buildCharacterStateSK(characterId: string): string {
  return `CHAR#${characterId}#STATE`;
}

/**
 * メッセージ範囲クエリ用の SK プレフィックス。
 * `begins_with(SK, prefix)` で 1 キャラ分のメッセージのみを抽出する。
 */
export function buildMessageSKPrefix(characterId: string): string {
  return `CHAR#${characterId}#MSG#`;
}

export function buildMessageSK(characterId: string, messageId: string): string {
  return `${buildMessageSKPrefix(characterId)}${messageId}`;
}
