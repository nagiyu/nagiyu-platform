import { InMemorySingleTableStore, type DynamoDBItem } from '@nagiyu/aws';
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
} from '../mappers/keys.js';
import { OptimisticLockError } from './optimistic-lock.error.js';
import type { TopicBundle, TopicRepository } from './topic.repository.interface.js';

/**
 * Topic（ヘッダ・META）+ SELF fact + WEB fact を扱う統合リポジトリの InMemory 実装
 * （リブトーク知識再設計 P1 / #3697）。GSI3（GSI-TOPIC）相当は配列フィルタで再現する。
 */
export class InMemoryTopicRepository implements TopicRepository {
  private readonly topicMapper = new TopicMapper();
  private readonly selfFactMapper = new SelfFactMapper();
  private readonly webFactMapper = new WebFactMapper();
  private readonly store: InMemorySingleTableStore;
  private readonly ulidFactory: UlidFactory;
  private readonly nowMs: () => number;

  constructor(
    store: InMemorySingleTableStore,
    ulidFactory: UlidFactory = defaultUlidFactory,
    nowMs: () => number = () => Date.now()
  ) {
    this.store = store;
    this.ulidFactory = ulidFactory;
    this.nowMs = nowMs;
  }

  public async putTopic(
    input: CreateTopicInput,
    opts: { expectedUpdatedAt?: number } = {}
  ): Promise<TopicEntity> {
    const now = this.nowMs();
    const { pk, sk } = this.topicMapper.buildKeys({
      userId: input.UserID,
      characterId: input.CharacterID,
      topicId: input.TopicID,
    });
    const existingItem = this.store.get(pk, sk);
    const identifier = `${input.UserID}#${input.CharacterID}#${input.TopicID}`;

    if (opts.expectedUpdatedAt === undefined) {
      if (existingItem) {
        throw new OptimisticLockError('Topic', identifier);
      }
    } else {
      const existingUpdatedAt = existingItem
        ? this.topicMapper.toEntity(existingItem).UpdatedAt
        : undefined;
      if (existingUpdatedAt !== opts.expectedUpdatedAt) {
        throw new OptimisticLockError('Topic', identifier);
      }
    }

    const createdAt = existingItem ? this.topicMapper.toEntity(existingItem).CreatedAt : now;
    const entity: TopicEntity = { ...input, CreatedAt: createdAt, UpdatedAt: now };
    this.store.put(this.topicMapper.toItem(entity));
    return entity;
  }

  public async getTopic(key: TopicKey): Promise<TopicEntity | null> {
    const { pk, sk } = this.topicMapper.buildKeys(key);
    const item = this.store.get(pk, sk);
    if (!item) return null;
    return this.topicMapper.toEntity(item);
  }

  public async getTopicBundle(key: TopicKey): Promise<TopicBundle> {
    const pk = buildUserPK(key.userId);
    const prefix = buildTopicBundleSKPrefix(key.characterId, key.topicId);
    const { items } = this.store.query(
      { pk, sk: { operator: 'begins_with', value: prefix } },
      { limit: Number.MAX_SAFE_INTEGER }
    );

    const bundle: TopicBundle = { topic: null, selfFacts: [], webFacts: [] };
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
    return bundle;
  }

  public async listTopicHeaders(userId: string, characterId: string): Promise<TopicEntity[]> {
    return this.queryGsi3(userId, characterId);
  }

  public async listTopicHeadersByCareDesc(
    userId: string,
    characterId: string,
    limit: number
  ): Promise<TopicEntity[]> {
    const all = await this.queryGsi3(userId, characterId);
    return [...all].sort((a, b) => b.Care - a.Care).slice(0, limit);
  }

  /** GSI3（GSI-TOPIC）相当を `GSI3PK` 属性の配列フィルタで再現する。 */
  private async queryGsi3(userId: string, characterId: string): Promise<TopicEntity[]> {
    const gsi3pk = buildTopicGSI3PK(characterId, userId);
    const results: TopicEntity[] = [];
    let cursor: string | undefined;

    do {
      const result = this.store.queryByAttribute(
        { attributeName: 'GSI3PK', attributeValue: gsi3pk },
        { limit: Number.MAX_SAFE_INTEGER, ...(cursor ? { cursor } : {}) }
      );
      for (const item of result.items) {
        results.push(this.topicMapper.toEntity(item));
      }
      cursor = result.nextCursor;
    } while (cursor !== undefined);

    return results;
  }

  public async putSelfFact(input: CreateSelfFactInput): Promise<SelfFactEntity> {
    const now = this.nowMs();
    const factId = input.FactID ?? this.ulidFactory(now);
    const entity: SelfFactEntity = { ...input, FactID: factId, CreatedAt: now };
    this.store.put(this.selfFactMapper.toItem(entity));
    return entity;
  }

  public async listSelfFacts(
    userId: string,
    characterId: string,
    topicId: string
  ): Promise<SelfFactEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildSelfFactSKPrefix(characterId, topicId);
    const { items } = this.store.query(
      { pk, sk: { operator: 'begins_with', value: prefix } },
      { limit: Number.MAX_SAFE_INTEGER }
    );
    return items.map((item: DynamoDBItem) => this.selfFactMapper.toEntity(item));
  }

  public async deleteSelfFact(key: SelfFactKey): Promise<void> {
    const { pk, sk } = this.selfFactMapper.buildKeys(key);
    this.store.delete(pk, sk);
  }

  public async putWebFact(input: CreateWebFactInput): Promise<WebFactEntity> {
    const now = this.nowMs();
    const factId = input.FactID ?? this.ulidFactory(now);
    const entity: WebFactEntity = { ...input, FactID: factId, CreatedAt: now };
    this.store.put(this.webFactMapper.toItem(entity));
    return entity;
  }

  public async listWebFacts(
    userId: string,
    characterId: string,
    topicId: string
  ): Promise<WebFactEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildWebFactSKPrefix(characterId, topicId);
    const { items } = this.store.query(
      { pk, sk: { operator: 'begins_with', value: prefix } },
      { limit: Number.MAX_SAFE_INTEGER }
    );
    return items.map((item: DynamoDBItem) => this.webFactMapper.toEntity(item));
  }
}
