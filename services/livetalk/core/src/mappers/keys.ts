/**
 * Single Table 設計の PK / SK を組み立てるための共通ヘルパー。
 *
 * 設計は `docs/services/livetalk/architecture.md` §3「データモデル概要」の SK パターンに準拠する。
 * PK は全エンティティで `USER#<googleId>` に統一する。
 *
 * GSI1: Profile 列挙用 sparse GSI（#3527）
 * - GSI1PK='PROFILE' の Profile アイテムのみを索引化する
 * - GSI1SK は生の UserID（USER# プレフィックスなし）
 *
 * GSI2: SafetyEvent のみを sparse 索引化する横断レビュー用 GSI（ADR-2.22 / #3580）
 * - GSI2PK='SAFETY' の SafetyEvent アイテムのみを索引化する
 * - GSI2SK は EventID（ULID、時系列ソート可能）をそのまま使用する
 * - 射影は INCLUDE（メタデータのみ。InputText / ResponseText は PII のため除外）
 *
 * GSI3（GSI-TOPIC）: Topic 中心モデルの Topic ヘッダ(META) のみを sparse 索引化する
 * 想起座標列挙・acquire 用 GSI（リブトーク知識再設計 P1 / #3697）
 * - GSI3PK=`<characterId>#TOPICS#<userId>` の META アイテムのみを索引化する
 * - GSI3SK は Care（Number 型）。care 降順 Query と全件列挙の両方を賄う
 * - `#META` は SK の接尾辞のため begins_with では列挙できない。
 *   Topic ヘッダの列挙は必ずこの GSI3 経由で行う。
 *
 * GSI4（GSI-STALE）: 揮発性のある WEB fact（NextReview を持つもの）のみを
 * sparse 索引化する鮮度掃引用 GSI（リブトーク知識再設計 P3 / #3699）
 * - GSI4PK=`<characterId>#STALE#<userId>` の WEB fact アイテムのみを索引化する
 *   （`NextReview` が undefined の stable fact には GSI4PK/GSI4SK を付与しない）
 * - GSI4SK は NextReview（Number 型、Unix ms）。acquire は
 *   `GSI4SK <= now` の**窓走査**（ページングして期限到来分をまとめて拾う）で
 *   鮮度切れ fact を列挙する。`begins_with` や現在時刻バケットのみの参照では
 *   停止・遅延分を取りこぼすため使わない。
 */

/** Profile 列挙 GSI のインデックス名 */
export const PROFILE_GSI_INDEX_NAME = 'GSI1';

/** SafetyEvent 横断レビュー GSI のインデックス名（ADR-2.22 / #3580） */
export const SAFETY_EVENT_GSI_INDEX_NAME = 'GSI2';

/** Topic ヘッダ列挙用 GSI-TOPIC のインデックス名（リブトーク知識再設計 P1 / #3697） */
export const TOPIC_GSI_INDEX_NAME = 'GSI3';

/** 鮮度掃引用 GSI-STALE のインデックス名（リブトーク知識再設計 P3 / #3699） */
export const STALE_GSI_INDEX_NAME = 'GSI4';

/**
 * GSI1 のパーティションキー値を返す。
 * Profile アイテムのみに付与する（sparse GSI）。
 */
export function buildProfileGSI1PK(): string {
  return 'PROFILE';
}

/**
 * GSI2 のパーティションキー値を返す。
 * SafetyEvent アイテムのみに付与する（sparse GSI）。
 * GSI2SK は EventID（ULID）をそのまま使用するため専用ビルダーは不要。
 */
export function buildSafetyEventGSI2PK(): string {
  return 'SAFETY';
}

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

// ---- チャット API 保護ガード（Issue #3528）----

/**
 * チャットロックアイテムの SK。固定値。
 * `USER#<userId>` PK 配下の `CHATLOCK` SK に対応する。
 */
export function buildChatLockSK(): string {
  return 'CHATLOCK';
}

/**
 * チャットレートリミットアイテムの SK を組み立てる。
 * `USER#<userId>` PK 配下の `RATELIMIT#<window>#<bucket>` SK に対応する。
 */
export function buildChatRateLimitSK(window: string, bucket: string): string {
  return `RATELIMIT#${window}#${bucket}`;
}

// ---- Topic 中心モデル（リブトーク知識再設計 P1 / #3697、shadow build）----
//
// 1 Topic = ヘッダ(META) + SELF fact 群 + WEB fact 群。
// META・SELF・WEB は同一 `CHAR#<c>#TOPIC#<tid>#` プレフィックス配下に同居させ、
// `getTopicBundle` で 1 Query に束ねて取得できるようにする。
// 座標（Embedding）は META（Topic 本体）に同居させ、別 item には切り出さない。

/**
 * Topic ヘッダ(META) の SK。
 * `#META` は接尾辞のため begins_with による列挙はできない
 * （列挙は必ず GSI3 経由で行う）。
 */
export function buildTopicMetaSK(characterId: string, topicId: string): string {
  return `${buildTopicBundleSKPrefix(characterId, topicId)}META`;
}

/**
 * 1 Topic 分（META + SELF 全部 + WEB 全部）を一括取得するための SK プレフィックス。
 * `begins_with(SK, prefix)` で 1 Query に束ねて取得する。
 */
export function buildTopicBundleSKPrefix(characterId: string, topicId: string): string {
  return `CHAR#${characterId}#TOPIC#${topicId}#`;
}

/**
 * SELF fact 範囲クエリ用の SK プレフィックス。
 */
export function buildSelfFactSKPrefix(characterId: string, topicId: string): string {
  return `${buildTopicBundleSKPrefix(characterId, topicId)}SELF#`;
}

export function buildSelfFactSK(characterId: string, topicId: string, factId: string): string {
  return `${buildSelfFactSKPrefix(characterId, topicId)}${factId}`;
}

/**
 * WEB fact 範囲クエリ用の SK プレフィックス。
 */
export function buildWebFactSKPrefix(characterId: string, topicId: string): string {
  return `${buildTopicBundleSKPrefix(characterId, topicId)}WEB#`;
}

export function buildWebFactSK(characterId: string, topicId: string, factId: string): string {
  return `${buildWebFactSKPrefix(characterId, topicId)}${factId}`;
}

/**
 * WEBRAW（Web 取得生データ、90日 TTL）範囲クエリ用の SK プレフィックス。
 */
export function buildWebRawSKPrefix(characterId: string): string {
  return `CHAR#${characterId}#WEBRAW#`;
}

export function buildWebRawSK(characterId: string, rawId: string): string {
  return `${buildWebRawSKPrefix(characterId)}${rawId}`;
}

/**
 * 集約（consolidation）カーソルの SK。固定・1 item。
 */
export function buildConsolidationCursorSK(characterId: string): string {
  return `CHAR#${characterId}#CURSOR`;
}

/**
 * GSI3（GSI-TOPIC）のパーティションキー値を返す。
 * Topic ヘッダ(META) アイテムのみに付与する（sparse GSI）。
 */
export function buildTopicGSI3PK(characterId: string, userId: string): string {
  return `${characterId}#TOPICS#${userId}`;
}

/**
 * GSI4（GSI-STALE）のパーティションキー値を返す。
 * 揮発性のある WEB fact（`NextReview` を持つもの）のみに付与する（sparse GSI）。
 */
export function buildTopicStaleGSI4PK(characterId: string, userId: string): string {
  return `${characterId}#STALE#${userId}`;
}
