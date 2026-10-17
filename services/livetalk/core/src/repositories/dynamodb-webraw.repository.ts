import { type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, queryAllItems, toDatabaseError, type EntityStore } from '@nagiyu/aws';
import { logger } from '@nagiyu/common';
import { WEBRAW_TTL_SECONDS } from '../constants.js';
import type { CreateWebRawInput, WebRawEntity, WebRawKey } from '../entities/webraw.entity.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import { WebRawMapper } from '../mappers/webraw.mapper.js';
import { buildUserPK, buildWebRawSKPrefix } from '../mappers/keys.js';
import type { WebRawRepository } from './webraw.repository.interface.js';

/**
 * WebRaw リポジトリの DynamoDB 実装。
 * 単一アイテムの書き込みは EntityStore に任せ、範囲クエリの `listSince` だけを自前で持つ
 * （begins_with + CreatedAt フィルタ + ページング）。
 */
export class DynamoDBWebRawRepository implements WebRawRepository {
  private readonly mapper: WebRawMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly ulidFactory: UlidFactory;
  private readonly nowMs: () => number;
  private readonly entityStore: EntityStore<WebRawEntity, WebRawKey>;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    ulidFactory: UlidFactory = defaultUlidFactory,
    nowMs: () => number = () => Date.now()
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.ulidFactory = ulidFactory;
    this.nowMs = nowMs;
    this.mapper = new WebRawMapper();
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper, { now: nowMs });
  }

  public async put(input: CreateWebRawInput): Promise<WebRawEntity> {
    const now = this.nowMs();
    return this.entityStore.put({
      ...input,
      rawId: input.rawId ?? this.ulidFactory(now),
      createdAt: now,
      // 90 日後に DynamoDB が自動削除する
      expiresAt: now + WEBRAW_TTL_SECONDS * 1000,
    });
  }

  public async listSince(
    userId: string,
    characterId: string,
    sinceMs: number
  ): Promise<WebRawEntity[]> {
    const pk = buildUserPK(userId);
    const skPrefix = buildWebRawSKPrefix(characterId);
    const results: WebRawEntity[] = [];

    try {
      const items = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
        FilterExpression: sinceMs > 0 ? 'CreatedAt > :sinceMs' : undefined,
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: {
          ':pk': pk,
          ':prefix': skPrefix,
          ...(sinceMs > 0 && { ':sinceMs': sinceMs }),
        },
        ScanIndexForward: true,
      });

      for (const raw of items) {
        try {
          results.push(this.mapper.toEntity(raw));
        } catch (error) {
          logger.warn('無効な WebRaw データをスキップしました', {
            pk: raw.PK,
            sk: raw.SK,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      throw toDatabaseError(error);
    }

    return results;
  }
}
