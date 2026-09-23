/**
 * 旧知識資材（Memory / Knowledge / InterestCategory）の DynamoDB 直読みリーダー
 * （一回性マイグレーション専用の throwaway コード）。
 *
 * 旧スキーマには専用リポジトリが存在しないため、`docClient` の Query 結果を
 * 寛容にパースする（属性が欠けている・型が不正なアイテムはスキップして warn ログを出す）。
 * 旧 MemorySummary（`CHAR#<c>#MEMORY#SUMMARY`）・旧 Note（`CHAR#<c>#NOTE#<ulid>`、
 * TopicID 属性を持たないもの）は破棄対象のため読み飛ばす。
 */
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { logger } from '@nagiyu/common';
import type { DynamoDBItem } from '@nagiyu/aws';
import { buildUserPK } from '../mappers/keys.js';
import { queryItemsByPrefix } from './dynamo-helpers.js';
import type {
  LegacyInterestCategoryEntity,
  LegacyKnowledgeEntity,
  LegacyMemoryEntity,
  LegacyReadResult,
} from './legacy-types.js';

function buildLegacyCharPrefix(characterId: string): string {
  return `CHAR#${characterId}#`;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'number')
    ? (value as number[])
    : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
    ? (value as string[])
    : [];
}

/**
 * 旧 Memory アイテムをパースする。`Content` が欠けている（＝擬似メッセージを
 * 作れない）場合のみスキップする。それ以外の属性は欠損時に安全なデフォルトへフォールバックする。
 */
function parseLegacyMemory(item: DynamoDBItem): LegacyMemoryEntity | null {
  const content = asNonEmptyString(item['Content']);
  if (content === undefined) return null;

  return {
    Content: content,
    Category: asString(item['Category']),
    Embedding: asNumberArray(item['Embedding']),
    ReferencedCount: asNumber(item['ReferencedCount']),
  };
}

/**
 * 旧 Knowledge アイテムをパースする。`Summary` が欠けている（＝擬似 webraw の
 * 本文を作れない）場合のみスキップする。
 */
function parseLegacyKnowledge(item: DynamoDBItem): LegacyKnowledgeEntity | null {
  const summary = asNonEmptyString(item['Summary']);
  if (summary === undefined) return null;

  return {
    Topic: asString(item['Topic']),
    Summary: summary,
    SourceUrls: asStringArray(item['SourceUrls']),
    RawComment: asString(item['RawComment']),
    RelatedCategory: asString(item['RelatedCategory']),
  };
}

/**
 * 旧 InterestCategory アイテムをパースする。`Category` が欠けている場合のみスキップする。
 */
function parseLegacyInterest(item: DynamoDBItem): LegacyInterestCategoryEntity | null {
  const category = asNonEmptyString(item['Category']);
  if (category === undefined) return null;

  return {
    Category: category,
    Weight: asNumber(item['Weight']),
    Embedding: asNumberArray(item['Embedding']),
  };
}

/**
 * 1 ユーザー × 1 キャラ分の旧スキーマ（Memory / Knowledge / InterestCategory）を読み取る。
 * 旧 MemorySummary・旧 Note（TopicID 属性を持たないもの）は破棄方針のため読み飛ばす。
 */
export async function readLegacyData(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  characterId: string
): Promise<LegacyReadResult> {
  const pk = buildUserPK(userId);
  const prefix = buildLegacyCharPrefix(characterId);
  const items = await queryItemsByPrefix(docClient, tableName, pk, prefix);

  const memories: LegacyMemoryEntity[] = [];
  const knowledge: LegacyKnowledgeEntity[] = [];
  const interests: LegacyInterestCategoryEntity[] = [];

  for (const item of items) {
    const sk = String(item['SK'] ?? '');

    if (sk.includes('#MEM#')) {
      const parsed = parseLegacyMemory(item);
      if (parsed) {
        memories.push(parsed);
      } else {
        logger.warn('[readLegacyData] 不正な旧 Memory をスキップしました', {
          userId,
          characterId,
          sk,
        });
      }
      continue;
    }

    if (sk.includes('#KNOWLEDGE#')) {
      const parsed = parseLegacyKnowledge(item);
      if (parsed) {
        knowledge.push(parsed);
      } else {
        logger.warn('[readLegacyData] 不正な旧 Knowledge をスキップしました', {
          userId,
          characterId,
          sk,
        });
      }
      continue;
    }

    if (sk.includes('#INTEREST#')) {
      const parsed = parseLegacyInterest(item);
      if (parsed) {
        interests.push(parsed);
      } else {
        logger.warn('[readLegacyData] 不正な旧 InterestCategory をスキップしました', {
          userId,
          characterId,
          sk,
        });
      }
      continue;
    }

    // MEMORY#SUMMARY・旧 Note・その他の旧/新スキーマ item は破棄・対象外のため読み飛ばす
  }

  return { memories, knowledge, interests };
}
