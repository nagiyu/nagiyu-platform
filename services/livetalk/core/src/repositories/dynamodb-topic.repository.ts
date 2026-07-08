import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError, type DynamoDBItem } from '@nagiyu/aws';
import type {
  CreateSelfFactInput,
  SelfFactEntity,
  SelfFactKey,
} from '../entities/self-fact.entity.js';
import type { CreateTopicInput, TopicEntity, TopicKey } from '../entities/topic.entity.js';
import type { CreateWebFactInput, WebFactEntity } from '../entities/web-fact.entity.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import { SelfFactMapper } from '../mappers/self-fact.mapper.js';
import { TopicMapper } from '../mappers/topic.mapper.js';
import { WebFactMapper } from '../mappers/web-fact.mapper.js';
import {
  buildSelfFactSKPrefix,
  buildTopicBundleSKPrefix,
  buildTopicGSI3PK,
  buildUserPK,
  buildWebFactSKPrefix,
  TOPIC_GSI_INDEX_NAME,
} from '../mappers/keys.js';
import { OptimisticLockError } from './optimistic-lock.error.js';
import type { TopicBundle, TopicRepository } from './topic.repository.interface.js';

/**
 * Topic（ヘッダ・META）+ SELF fact + WEB fact を扱う統合リポジトリの DynamoDB 実装
 * （リブトーク知識再設計 P1 / #3697）。
 */
export class DynamoDBTopicRepository implements TopicRepository {
  private readonly topicMapper = new TopicMapper();
  private readonly selfFactMapper = new SelfFactMapper();
  private readonly webFactMapper = new WebFactMapper();
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
  }

  public async putTopic(
    input: CreateTopicInput,
    opts: { expectedUpdatedAt?: number } = {}
  ): Promise<TopicEntity> {
    const now = this.nowMs();
    let createdAt = now;

    // 更新（楽観ロック）の場合のみ、既存の CreatedAt を維持するために事前取得する。
    // 実際の競合検知は Put の ConditionExpression（UpdatedAt = :expected）で行うため、
    // ここでの取得結果はあくまで CreatedAt 保持のためのベストエフォート。
    if (opts.expectedUpdatedAt !== undefined) {
      const existing = await this.getTopic({
        userId: input.UserID,
        characterId: input.CharacterID,
        topicId: input.TopicID,
      });
      if (existing) {
        createdAt = existing.CreatedAt;
      }
    }

    const entity: TopicEntity = {
      ...input,
      CreatedAt: createdAt,
      UpdatedAt: now,
    };

    const isUpdate = opts.expectedUpdatedAt !== undefined;

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: this.topicMapper.toItem(entity),
          ConditionExpression: isUpdate
            ? 'UpdatedAt = :expectedUpdatedAt'
            : 'attribute_not_exists(PK)',
          ...(isUpdate
            ? { ExpressionAttributeValues: { ':expectedUpdatedAt': opts.expectedUpdatedAt } }
            : {}),
        })
      );
      return entity;
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new OptimisticLockError(
          'Topic',
          `${entity.UserID}#${entity.CharacterID}#${entity.TopicID}`
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async getTopic(key: TopicKey): Promise<TopicEntity | null> {
    try {
      const { pk, sk } = this.topicMapper.buildKeys(key);
      const result = await this.docClient.send(
        new GetCommand({ TableName: this.tableName, Key: { PK: pk, SK: sk } })
      );
      if (!result.Item) return null;
      return this.topicMapper.toEntity(result.Item as unknown as DynamoDBItem);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async getTopicBundle(key: TopicKey): Promise<TopicBundle> {
    const pk = buildUserPK(key.userId);
    const prefix = buildTopicBundleSKPrefix(key.characterId, key.topicId);
    const bundle: TopicBundle = { topic: null, selfFacts: [], webFacts: [] };
    let exclusiveStartKey: Record<string, unknown> | undefined;

    for (;;) {
      let result;
      try {
        result = await this.docClient.send(
          new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
            ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
            ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
            ExclusiveStartKey: exclusiveStartKey,
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new DatabaseError(message, error instanceof Error ? error : undefined);
      }

      for (const raw of result.Items ?? []) {
        const item = raw as unknown as DynamoDBItem;
        switch (item.Type) {
          case 'Topic':
            bundle.topic = this.topicMapper.toEntity(item);
            break;
          case 'SelfFact':
            bundle.selfFacts.push(this.selfFactMapper.toEntity(item));
            break;
          case 'WebFact':
            bundle.webFacts.push(this.webFactMapper.toEntity(item));
            break;
          default:
            break;
        }
      }

      if (!result.LastEvaluatedKey) break;
      exclusiveStartKey = result.LastEvaluatedKey;
    }

    return bundle;
  }

  public async listTopicHeaders(userId: string, characterId: string): Promise<TopicEntity[]> {
    return this.queryGsi3(userId, characterId, { scanIndexForward: true });
  }

  public async listTopicHeadersByCareDesc(
    userId: string,
    characterId: string,
    limit: number
  ): Promise<TopicEntity[]> {
    return this.queryGsi3(userId, characterId, { scanIndexForward: false, limit });
  }

  private async queryGsi3(
    userId: string,
    characterId: string,
    options: { scanIndexForward: boolean; limit?: number }
  ): Promise<TopicEntity[]> {
    const gsi3pk = buildTopicGSI3PK(characterId, userId);
    const results: TopicEntity[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    for (;;) {
      let result;
      try {
        result = await this.docClient.send(
          new QueryCommand({
            TableName: this.tableName,
            IndexName: TOPIC_GSI_INDEX_NAME,
            KeyConditionExpression: '#gsi3pk = :pk',
            ExpressionAttributeNames: { '#gsi3pk': 'GSI3PK' },
            ExpressionAttributeValues: { ':pk': gsi3pk },
            ScanIndexForward: options.scanIndexForward,
            ...(options.limit !== undefined ? { Limit: options.limit } : {}),
            ExclusiveStartKey: exclusiveStartKey,
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new DatabaseError(message, error instanceof Error ? error : undefined);
      }

      for (const raw of result.Items ?? []) {
        results.push(this.topicMapper.toEntity(raw as unknown as DynamoDBItem));
        if (options.limit !== undefined && results.length >= options.limit) {
          return results.slice(0, options.limit);
        }
      }

      if (!result.LastEvaluatedKey) break;
      exclusiveStartKey = result.LastEvaluatedKey;
    }

    return results;
  }

  public async putSelfFact(input: CreateSelfFactInput): Promise<SelfFactEntity> {
    const now = this.nowMs();
    const factId = input.FactID ?? this.ulidFactory(now);
    const entity: SelfFactEntity = { ...input, FactID: factId, CreatedAt: now };

    try {
      await this.docClient.send(
        new PutCommand({ TableName: this.tableName, Item: this.selfFactMapper.toItem(entity) })
      );
      return entity;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async listSelfFacts(
    userId: string,
    characterId: string,
    topicId: string
  ): Promise<SelfFactEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildSelfFactSKPrefix(characterId, topicId);
    return this.queryByPrefix(pk, prefix, this.selfFactMapper);
  }

  public async deleteSelfFact(key: SelfFactKey): Promise<void> {
    try {
      const { pk, sk } = this.selfFactMapper.buildKeys(key);
      await this.docClient.send(
        new DeleteCommand({ TableName: this.tableName, Key: { PK: pk, SK: sk } })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async putWebFact(input: CreateWebFactInput): Promise<WebFactEntity> {
    const now = this.nowMs();
    const factId = input.FactID ?? this.ulidFactory(now);
    const entity: WebFactEntity = { ...input, FactID: factId, CreatedAt: now };

    try {
      await this.docClient.send(
        new PutCommand({ TableName: this.tableName, Item: this.webFactMapper.toItem(entity) })
      );
      return entity;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async listWebFacts(
    userId: string,
    characterId: string,
    topicId: string
  ): Promise<WebFactEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildWebFactSKPrefix(characterId, topicId);
    return this.queryByPrefix(pk, prefix, this.webFactMapper);
  }

  private async queryByPrefix<T>(
    pk: string,
    skPrefix: string,
    mapper: { toEntity(item: DynamoDBItem): T }
  ): Promise<T[]> {
    const results: T[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    for (;;) {
      let result;
      try {
        result = await this.docClient.send(
          new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
            ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
            ExpressionAttributeValues: { ':pk': pk, ':prefix': skPrefix },
            ExclusiveStartKey: exclusiveStartKey,
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new DatabaseError(message, error instanceof Error ? error : undefined);
      }

      for (const raw of result.Items ?? []) {
        results.push(mapper.toEntity(raw as unknown as DynamoDBItem));
      }

      if (!result.LastEvaluatedKey) break;
      exclusiveStartKey = result.LastEvaluatedKey;
    }

    return results;
  }
}
