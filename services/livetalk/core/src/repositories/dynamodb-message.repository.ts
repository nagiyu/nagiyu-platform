import {
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
  type QueryCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError, EntityAlreadyExistsError, type DynamoDBItem } from '@nagiyu/aws';
import { logger } from '@nagiyu/common';
import { MESSAGE_TTL_SECONDS, TOKEN_BUDGETED_QUERY_PAGE_SIZE } from '../constants.js';
import type { CreateMessageInput, MessageEntity, MessageKey } from '../entities/message.entity.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import { getDefaultTokenCounter, resolveContextTokenLimit } from '../lib/token-counter.js';
import { MessageMapper } from '../mappers/message.mapper.js';
import { buildMessageSKPrefix, buildUserPK } from '../mappers/keys.js';
import type {
  GetRecentByTokenBudgetOptions,
  MessageRepository,
  RecentMessagesResult,
} from './message.repository.interface.js';

const DEFAULT_HARD_LIMIT = 500;

export class DynamoDBMessageRepository implements MessageRepository {
  private readonly mapper: MessageMapper;
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
    this.mapper = new MessageMapper();
  }

  public async create(input: CreateMessageInput): Promise<MessageEntity> {
    const now = this.nowMs();
    const messageId = input.MessageID ?? this.ulidFactory(now);

    const entity: MessageEntity = {
      ...input,
      MessageID: messageId,
      CreatedAt: now,
      UpdatedAt: now,
    };

    const item: DynamoDBItem & { TTL: number } = {
      ...this.mapper.toItem(entity),
      // TTL は Unix 秒。Message は 90 日後に DynamoDB が自動削除する。
      TTL: Math.floor(now / 1000) + MESSAGE_TTL_SECONDS,
    };

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );
      return entity;
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new EntityAlreadyExistsError(
          this.mapper.entityType,
          `${entity.UserID}#${entity.CharacterID}#${messageId}`
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async getById(key: MessageKey): Promise<MessageEntity | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys(key);
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
        })
      );
      if (!result.Item) return null;
      return this.mapper.toEntity(result.Item as unknown as DynamoDBItem);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async listSince(
    userId: string,
    characterId: string,
    sinceMs: number
  ): Promise<MessageEntity[]> {
    const pk = buildUserPK(userId);
    const skPrefix = buildMessageSKPrefix(characterId);
    const results: MessageEntity[] = [];
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
          logger.warn('無効なメッセージデータをスキップしました', {
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

  public async getRecentByTokenBudget(
    options: GetRecentByTokenBudgetOptions
  ): Promise<RecentMessagesResult> {
    const { userId, characterId } = options;
    const tokenLimit = resolveContextTokenLimit(options.tokenLimit);
    const tokenCounter = options.tokenCounter ?? getDefaultTokenCounter();
    const hardLimit = options.hardLimit ?? DEFAULT_HARD_LIMIT;

    const pk = buildUserPK(userId);
    const skPrefix = buildMessageSKPrefix(characterId);

    const collected: MessageEntity[] = [];
    let totalTokens = 0;
    let truncated = false;
    let totalConsumedCapacity = 0;
    let exclusiveStartKey: Record<string, unknown> | undefined;

    while (collected.length < hardLimit) {
      let result: QueryCommandOutput;
      try {
        result = await this.docClient.send(
          new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
            ExpressionAttributeNames: {
              '#pk': 'PK',
              '#sk': 'SK',
            },
            ExpressionAttributeValues: {
              ':pk': pk,
              ':prefix': skPrefix,
            },
            // 新しい順にスキャンし、トークン上限到達で打ち切る
            ScanIndexForward: false,
            Limit: TOKEN_BUDGETED_QUERY_PAGE_SIZE,
            ExclusiveStartKey: exclusiveStartKey,
            ReturnConsumedCapacity: 'TOTAL',
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new DatabaseError(message, error instanceof Error ? error : undefined);
      }

      totalConsumedCapacity += result.ConsumedCapacity?.CapacityUnits ?? 0;
      const items = result.Items ?? [];
      let pageExhausted = true;
      for (const raw of items) {
        let entity: MessageEntity;
        try {
          entity = this.mapper.toEntity(raw as unknown as DynamoDBItem);
        } catch (error) {
          // 単一アイテムの破損で全体を壊さない（既存リポジトリと同様の運用）。
          const record = raw as Record<string, unknown>;
          logger.warn('無効なメッセージデータをスキップしました', {
            pk: record.PK,
            sk: record.SK,
            error: error instanceof Error ? error.message : String(error),
          });
          continue;
        }

        const cost = tokenCounter.countTokensForMessage(entity.Text);
        // 既に 1 件以上拾った後で上限超過なら、今のメッセージは含めずに打ち切る。
        // まだ 0 件ならコンテキスト皆無を避けるため最初の 1 件は強制的に採用する。
        if (collected.length > 0 && totalTokens + cost > tokenLimit) {
          truncated = true;
          pageExhausted = false;
          break;
        }
        collected.push(entity);
        totalTokens += cost;
        if (collected.length >= hardLimit) {
          // hardLimit に達した場合、まだ古いメッセージが残っていれば truncated 扱い
          truncated = true;
          pageExhausted = false;
          break;
        }
      }

      if (!pageExhausted) break;
      if (!result.LastEvaluatedKey) break;
      exclusiveStartKey = result.LastEvaluatedKey;
    }

    // ULID 降順で集めたものを LLM プロンプト用に時系列昇順へ並べ直す。
    collected.reverse();

    return {
      messages: collected,
      totalTokens,
      truncated,
      consumedCapacity: totalConsumedCapacity > 0 ? totalConsumedCapacity : undefined,
    };
  }
}
