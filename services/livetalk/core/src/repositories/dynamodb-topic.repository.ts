import { type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { logger } from '@nagiyu/common';
import {
  DynamoDBEntityStore,
  EntityNotFoundError,
  queryAllItems,
  queryPages,
  toDatabaseError,
  type DynamoDBAttributes,
  type EntityStore,
} from '@nagiyu/aws';
import type {
  CreateSelfFactInput,
  SelfFactEntity,
  SelfFactKey,
} from '../entities/self-fact.entity.js';
import type { CreateTopicInput, TopicEntity, TopicKey } from '../entities/topic.entity.js';
import type { CreateWebFactInput, WebFactEntity, WebFactKey } from '../entities/web-fact.entity.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import { SelfFactMapper } from '../mappers/self-fact.mapper.js';
import { TopicMapper } from '../mappers/topic.mapper.js';
import { WebFactMapper } from '../mappers/web-fact.mapper.js';
import {
  buildSelfFactSKPrefix,
  buildTopicBundleSKPrefix,
  buildTopicGSI3PK,
  buildTopicStaleGSI4PK,
  buildUserPK,
  buildWebFactSKPrefix,
  STALE_GSI_INDEX_NAME,
  TOPIC_GSI_INDEX_NAME,
} from '../mappers/keys.js';
import type { TopicBundle, TopicRepository } from './topic.repository.interface.js';

/**
 * Topic（ヘッダ・META）+ SELF fact + WEB fact を扱う統合リポジトリの DynamoDB 実装。
 *
 * 単一アイテムの CRUD はエンティティごとの EntityStore に任せ、
 * bundle の 1 Query 取得や GSI3 / GSI4 の走査だけを自前で持つ。
 */
export class DynamoDBTopicRepository implements TopicRepository {
  private readonly topicMapper = new TopicMapper();
  private readonly selfFactMapper = new SelfFactMapper();
  private readonly webFactMapper = new WebFactMapper();
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly ulidFactory: UlidFactory;
  private readonly nowMs: () => number;
  private readonly topicStore: EntityStore<TopicEntity, TopicKey>;
  private readonly selfFactStore: EntityStore<SelfFactEntity, SelfFactKey>;
  private readonly webFactStore: EntityStore<WebFactEntity, WebFactKey>;

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
    this.topicStore = new DynamoDBEntityStore(docClient, tableName, this.topicMapper, {
      now: nowMs,
    });
    this.selfFactStore = new DynamoDBEntityStore(docClient, tableName, this.selfFactMapper, {
      now: nowMs,
    });
    this.webFactStore = new DynamoDBEntityStore(docClient, tableName, this.webFactMapper, {
      now: nowMs,
    });
  }

  public async putTopic(
    input: CreateTopicInput,
    opts: { expectedUpdatedAt?: number } = {}
  ): Promise<TopicEntity> {
    const key: TopicKey = {
      userId: input.userId,
      characterId: input.characterId,
      topicId: input.topicId,
    };

    if (opts.expectedUpdatedAt === undefined) {
      // 新規作成の衝突も呼び出し側が楽観ロック競合として扱えるよう、同じエラーに揃える
      return this.topicStore.create(input, { conflictAsOptimisticLock: true });
    }

    // 競合の検知は put の楽観ロックが行う。ここでの読み取りは createdAt を保つためのもの
    const existing = await this.getTopic(key);
    return this.topicStore.put(
      { ...input, createdAt: existing?.createdAt },
      { expectedUpdatedAt: opts.expectedUpdatedAt }
    );
  }

  public async getTopic(key: TopicKey): Promise<TopicEntity | null> {
    return this.topicStore.get(key);
  }

  public async getTopicBundle(key: TopicKey): Promise<TopicBundle> {
    const pk = buildUserPK(key.userId);
    const prefix = buildTopicBundleSKPrefix(key.characterId, key.topicId);
    const bundle: TopicBundle = { topic: null, selfFacts: [], webFacts: [] };

    try {
      const items = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
      });

      for (const item of items) {
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
    } catch (error) {
      throw toDatabaseError(error);
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

    try {
      for await (const page of queryPages(this.docClient, {
        TableName: this.tableName,
        IndexName: TOPIC_GSI_INDEX_NAME,
        KeyConditionExpression: '#gsi3pk = :pk',
        ExpressionAttributeNames: { '#gsi3pk': 'GSI3PK' },
        ExpressionAttributeValues: { ':pk': gsi3pk },
        ScanIndexForward: options.scanIndexForward,
        ...(options.limit !== undefined ? { Limit: options.limit } : {}),
      })) {
        for (const raw of page) {
          results.push(this.topicMapper.toEntity(raw));
          if (options.limit !== undefined && results.length >= options.limit) {
            return results.slice(0, options.limit);
          }
        }
      }
    } catch (error) {
      throw toDatabaseError(error);
    }

    return results;
  }

  public async putSelfFact(input: CreateSelfFactInput): Promise<SelfFactEntity> {
    const now = this.nowMs();
    return this.selfFactStore.put({
      ...input,
      factId: input.factId ?? this.ulidFactory(now),
      createdAt: now,
    });
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
    await this.selfFactStore.delete(key);
  }

  public async putWebFact(input: CreateWebFactInput): Promise<WebFactEntity> {
    const now = this.nowMs();
    return this.webFactStore.put({
      ...input,
      factId: input.factId ?? this.ulidFactory(now),
      createdAt: now,
    });
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

  public async listStaleWebFacts(
    userId: string,
    characterId: string,
    nowMs: number,
    limit: number
  ): Promise<WebFactEntity[]> {
    const gsi4pk = buildTopicStaleGSI4PK(characterId, userId);
    const results: WebFactEntity[] = [];

    try {
      for await (const page of queryPages(this.docClient, {
        TableName: this.tableName,
        IndexName: STALE_GSI_INDEX_NAME,
        KeyConditionExpression: '#gsi4pk = :pk AND #gsi4sk <= :now',
        ExpressionAttributeNames: { '#gsi4pk': 'GSI4PK', '#gsi4sk': 'GSI4SK' },
        ExpressionAttributeValues: { ':pk': gsi4pk, ':now': nowMs },
        // 期限が古い順（昇順）で窓走査する。停止分・遅延分を取りこぼさないため、
        // begins_with や現在バケットのみの参照ではなく `GSI4SK <= now` で幅広く拾う。
        ScanIndexForward: true,
      })) {
        for (const raw of page) {
          results.push(this.webFactMapper.toEntity(raw));
          if (results.length >= limit) {
            return results.slice(0, limit);
          }
        }
      }
    } catch (error) {
      throw toDatabaseError(error);
    }

    return results;
  }

  public async updateWebFactNextReview(key: WebFactKey, nextReview: number): Promise<void> {
    try {
      await this.webFactStore.update(key, { nextReview });
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        logger.warn(
          '[DynamoDBTopicRepository] updateWebFactNextReview: 対象 WEB fact が存在しません',
          { key }
        );
        return;
      }
      throw error;
    }
  }

  private async queryByPrefix<T>(
    pk: string,
    skPrefix: string,
    mapper: { toEntity(item: DynamoDBAttributes): T }
  ): Promise<T[]> {
    try {
      const items = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: { ':pk': pk, ':prefix': skPrefix },
      });
      return items.map((raw) => mapper.toEntity(raw));
    } catch (error) {
      throw toDatabaseError(error);
    }
  }
}
