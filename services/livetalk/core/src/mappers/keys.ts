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

/**
 * SafetyEvent の SK。
 * `SAFETY#` プレフィックスで他エンティティと論理分離する。
 */
export function buildSafetyEventSK(eventId: string): string {
  return `SAFETY#${eventId}`;
}

export function buildSafetyEventSKPrefix(): string {
  return 'SAFETY#';
}

/**
 * 全 Tier のメモリ範囲クエリ用 SK プレフィックス。
 * `begins_with(SK, prefix)` でキャラ単位の全メモリを抽出する。
 */
export function buildMemoryAllTiersSKPrefix(characterId: string): string {
  return `CHAR#${characterId}#MEM#`;
}

/**
 * 特定 Tier のメモリ範囲クエリ用 SK プレフィックス。
 */
export function buildMemoryTierSKPrefix(characterId: string, tier: string): string {
  return `CHAR#${characterId}#MEM#${tier}#`;
}

/**
 * 特定 Tier + カテゴリのメモリ範囲クエリ用 SK プレフィックス。
 */
export function buildMemoryCategoryInTierSKPrefix(
  characterId: string,
  tier: string,
  category: string
): string {
  return `CHAR#${characterId}#MEM#${tier}#${category}#`;
}

export function buildMemorySK(
  characterId: string,
  tier: string,
  category: string,
  memoryId: string
): string {
  return `CHAR#${characterId}#MEM#${tier}#${category}#${memoryId}`;
}

export function buildMemorySummarySK(characterId: string): string {
  return `CHAR#${characterId}#MEMORY#SUMMARY`;
}
