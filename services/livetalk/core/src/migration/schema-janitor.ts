/**
 * 旧/新スキーマの削除ユーティリティ（schema janitor）（一回性マイグレーション専用の
 * throwaway コード）。
 *
 * 削除は必ず「明示ホワイトリスト」に限定し、それ以外は既定で残す（fail-safe）。
 * 絶対に触ってはいけない Type（Profile / PushSubscription / CharacterState / Lifecycle /
 * SafetyEvent / NotificationEvent、および実メッセージ `CHAR#<c>#MSG#` / CHATLOCK /
 * RATELIMIT# / STUDY#）は、PK 配下を `CHAR#<characterId>#` プレフィックスで絞り込んだ上に
 * さらにホワイトリスト一致でしか削除対象に含めないため、二重に対象外となる。
 */
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBItem } from '@nagiyu/aws';
import { buildUserPK } from '../mappers/keys.js';
import { batchDeleteItems, logDeletionPlan, queryItemsByPrefix } from './dynamo-helpers.js';

/** 削除対象スキーマの種別。`old` = 旧スキーマ（deleteOldAfter）、`new` = 新スキーマ（wipeNewFirst）。 */
export type SchemaTarget = 'old' | 'new';

function buildCharPrefix(characterId: string): string {
  return `CHAR#${characterId}#`;
}

/**
 * 触ってはいけない Type を明示的に除外する二重防御（本来ここに来る想定は無いが、
 * ホワイトリスト側の実装ミスに備えたフェイルセーフ）。
 */
function isProtectedSK(sk: string): boolean {
  return (
    sk.includes('#MSG#') ||
    sk.endsWith('#STATE') ||
    sk.endsWith('#LIFECYCLE') ||
    sk.includes('#STUDY#') ||
    sk === 'CHATLOCK' ||
    sk.startsWith('RATELIMIT#') ||
    sk.startsWith('SAFETY#') ||
    sk.startsWith('PUSH_SUBSCRIPTION#') ||
    sk.startsWith('NOTIF#') ||
    sk === 'PROFILE'
  );
}

function isNoteSK(sk: string): boolean {
  return /^CHAR#[^#]+#NOTE#[^#]+$/.test(sk);
}

/** 新 Note は `TopicID` 属性を持つ（旧 Note は持たない）。 */
function hasTopicId(item: DynamoDBItem): boolean {
  return typeof item['TopicID'] === 'string' && item['TopicID'].length > 0;
}

/**
 * 旧スキーマ（KNOWLEDGE / MEM / INTEREST / MEMORY#SUMMARY / 旧 Note）かどうかを判定する。
 */
function isLegacySchemaItem(sk: string, item: DynamoDBItem): boolean {
  if (isProtectedSK(sk)) return false;
  return (
    /^CHAR#[^#]+#KNOWLEDGE#[^#]+$/.test(sk) ||
    /^CHAR#[^#]+#MEM#[^#]+#[^#]+#[^#]+$/.test(sk) ||
    /^CHAR#[^#]+#INTEREST#[^#]+$/.test(sk) ||
    /^CHAR#[^#]+#MEMORY#SUMMARY$/.test(sk) ||
    (isNoteSK(sk) && !hasTopicId(item))
  );
}

/**
 * 新スキーマ（TOPIC の META/SELF/WEB・WEBRAW・新 Note・CURSOR）かどうかを判定する。
 */
function isNewSchemaItem(sk: string, item: DynamoDBItem): boolean {
  if (isProtectedSK(sk)) return false;
  return (
    /^CHAR#[^#]+#TOPIC#[^#]+#META$/.test(sk) ||
    /^CHAR#[^#]+#TOPIC#[^#]+#SELF#[^#]+$/.test(sk) ||
    /^CHAR#[^#]+#TOPIC#[^#]+#WEB#[^#]+$/.test(sk) ||
    /^CHAR#[^#]+#WEBRAW#[^#]+$/.test(sk) ||
    (isNoteSK(sk) && hasTopicId(item)) ||
    /^CHAR#[^#]+#CURSOR$/.test(sk)
  );
}

/**
 * 単一アイテムが指定スキーマ種別（`old`/`new`）の削除対象ホワイトリストに含まれるかを判定する。
 * テスト・呼び出し側から個別に検証しやすいよう公開する。
 */
export function classifySchemaItem(sk: string, item: DynamoDBItem, target: SchemaTarget): boolean {
  return target === 'old' ? isLegacySchemaItem(sk, item) : isNewSchemaItem(sk, item);
}

/**
 * 1 ユーザー × 1 キャラ配下から、指定スキーマ種別の削除対象アイテムを検索する（削除はしない）。
 * dryRun のレポート（件数）作成にも使う。
 */
export async function findSchemaItems(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  characterId: string,
  target: SchemaTarget
): Promise<DynamoDBItem[]> {
  const pk = buildUserPK(userId);
  const prefix = buildCharPrefix(characterId);
  const items = await queryItemsByPrefix(docClient, tableName, pk, prefix);
  return items.filter((item) => classifySchemaItem(String(item['SK'] ?? ''), item, target));
}

export interface DeleteSchemaItemsResult {
  deletedCount: number;
}

/**
 * 1 ユーザー × 1 キャラ配下の、指定スキーマ種別の対象アイテムを削除する。
 * 削除前に対象件数・SK 一覧をログ出力する（本文 PII は含めない）。
 */
export async function deleteSchemaItems(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  characterId: string,
  target: SchemaTarget
): Promise<DeleteSchemaItemsResult> {
  const items = await findSchemaItems(docClient, tableName, userId, characterId, target);
  logDeletionPlan('[schema-janitor] 削除予定', userId, characterId, target, items);
  const deletedCount = await batchDeleteItems(docClient, tableName, items);
  return { deletedCount };
}
