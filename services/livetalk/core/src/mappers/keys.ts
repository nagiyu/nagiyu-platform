/**
 * Single Table 設計の PK / SK を組み立てるための共通ヘルパー。
 *
 * 設計は `docs/services/livetalk/architecture.md` §3「データモデル概要」の SK パターンに準拠する。
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

export function buildInterestSKPrefix(characterId: string): string {
  return `CHAR#${characterId}#INTEREST#`;
}

export function buildInterestSK(characterId: string, category: string): string {
  return `${buildInterestSKPrefix(characterId)}${category}`;
}

export function buildLifecycleSK(characterId: string): string {
  return `CHAR#${characterId}#LIFECYCLE`;
}

export function buildKnowledgeSKPrefix(characterId: string): string {
  return `CHAR#${characterId}#KNOWLEDGE#`;
}

export function buildKnowledgeSK(characterId: string, knowledgeId: string): string {
  return `${buildKnowledgeSKPrefix(characterId)}${knowledgeId}`;
}

export function buildStudyTopicSKPrefix(characterId: string): string {
  return `CHAR#${characterId}#STUDY#`;
}

export function buildStudyTopicSK(characterId: string, topicId: string): string {
  return `${buildStudyTopicSKPrefix(characterId)}${topicId}`;
}

export function buildNoteSKPrefix(characterId: string): string {
  return `CHAR#${characterId}#NOTE#`;
}

export function buildNoteSK(characterId: string, noteId: string): string {
  return `${buildNoteSKPrefix(characterId)}${noteId}`;
}

export function buildPushSubscriptionSKPrefix(): string {
  return 'PUSH_SUBSCRIPTION#';
}

export function buildPushSubscriptionSK(subscriptionId: string): string {
  return `PUSH_SUBSCRIPTION#${subscriptionId}`;
}

export function buildNotifSKPrefix(): string {
  return 'NOTIF#';
}

export function buildNotifSK(notifId: string): string {
  return `NOTIF#${notifId}`;
}
