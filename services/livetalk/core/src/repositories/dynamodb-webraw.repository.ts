import { PutCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DatabaseError, type DynamoDBItem } from '@nagiyu/aws';
import { logger } from '@nagiyu/common';
import { WEBRAW_TTL_SECONDS } from '../constants.js';
import type { CreateWebRawInput, WebRawEntity } from '../entities/webraw.entity.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import { WebRawMapper } from '../mappers/webraw.mapper.js';
import { buildUserPK, buildWebRawSKPrefix } from '../mappers/keys.js';
import type { WebRawRepository } from './webraw.repository.interface.js';

/**
 * WebRaw リポジトリの DynamoDB 実装（リブトーク知識再設計 P1 / #3697）。
 * `listSince` は `DynamoDBMessageRepository.listSince` と同じ実装方針
 * （begins_with + CreatedAt フィルタ + ページング）。
 */
export class DynamoDBWebRawRepository implements WebRawRepository {
  private readonly mapper: WebRawMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly ulidFactory: UlidFactory;
  private readonly nowMs: () => number;

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
  }

  public async put(input: CreateWebRawInput): Promise<WebRawEntity> {
    const now = this.nowMs();
    const rawId = input.RawID ?? this.ulidFactory(now);

    const entity: WebRawEntity = {
      ...input,
      RawID: rawId,
      CreatedAt: now,
    };

    const item: DynamoDBItem & { TTL: number } = {
      ...this.mapper.toItem(entity),
      // TTL は Unix 秒。WebRaw は 90 日後に DynamoDB が自動削除する。
      TTL: Math.floor(now / 1000) + WEBRAW_TTL_SECONDS,
    };

    try {
      await this.docClient.send(new PutCommand({ TableName: this.tableName, Item: item }));
      return entity;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async listSince(
    userId: string,
    characterId: string,
    sinceMs: number
  ): Promise<WebRawEntity[]> {
    const pk = buildUserPK(userId);
    const skPrefix = buildWebRawSKPrefix(characterId);
    const results: WebRawEntity[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    for (;;) {
      let result;
      try {
        result = await this.docClient.send(
          new QueryCommand({
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
            ExclusiveStartKey: exclusiveStartKey,
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new DatabaseError(message, error instanceof Error ? error : undefined);
      }

      for (const raw of result.Items ?? []) {
        try {
          results.push(this.mapper.toEntity(raw as unknown as DynamoDBItem));
        } catch (error) {
          logger.warn('無効な WebRaw データをスキップしました', {
            pk: (raw as Record<string, unknown>).PK,
            sk: (raw as Record<string, unknown>).SK,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (!result.LastEvaluatedKey) break;
      exclusiveStartKey = result.LastEvaluatedKey;
    }

    return results;
  }
}
