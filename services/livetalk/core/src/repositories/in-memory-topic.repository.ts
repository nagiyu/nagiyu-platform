import { logger } from '@nagiyu/common';
import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InMemoryEntityStore,
  OptimisticLockError,
  type DynamoDBAttributes,
  type EntityStore,
  type InMemorySingleTableStore,
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
  STALE_GSI_PROJECTION,
  TOPIC_GSI_PROJECTION,
} from '../mappers/keys.js';
import type { TopicBundle, TopicRepository } from './topic.repository.interface.js';

/**
 * Topic（ヘッダ・META）+ SELF fact + WEB fact を扱う統合リポジトリの InMemory 実装。
 * GSI3（GSI-TOPIC）・GSI4（GSI-STALE）相当は属性の配列フィルタで再現する。
 */
export class InMemoryTopicRepository implements TopicRepository {
  private readonly topicMapper = new TopicMapper();
  private readonly selfFactMapper = new SelfFactMapper();
  private readonly webFactMapper = new WebFactMapper();
  private readonly store: InMemorySingleTableStore;
  private readonly ulidFactory: UlidFactory;
  private readonly nowMs: () => number;
  private readonly topicStore: EntityStore<TopicEntity, TopicKey>;
  private readonly selfFactStore: EntityStore<SelfFactEntity, SelfFactKey>;
  private readonly webFactStore: EntityStore<WebFactEntity, WebFactKey>;

  constructor(
    store: InMemorySingleTableStore,
    ulidFactory: UlidFactory = defaultUlidFactory,
    nowMs: () => number = () => Date.now()
  ) {
    this.store = store;
    this.ulidFactory = ulidFactory;
    this.nowMs = nowMs;
    this.topicStore = new InMemoryEntityStore(store, this.topicMapper, { now: nowMs });
    this.selfFactStore = new InMemoryEntityStore(store, this.selfFactMapper, { now: nowMs });
    this.webFactStore = new InMemoryEntityStore(store, this.webFactMapper, { now: nowMs });
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
      try {
        return await this.topicStore.create(input);
      } catch (error) {
        // 新規作成の衝突も呼び出し側が楽観ロック競合として扱えるよう、同じエラーに揃える
        if (error instanceof EntityAlreadyExistsError) {
          throw new OptimisticLockError('Topic', `${key.userId}#${key.characterId}#${key.topicId}`);
        }
        throw error;
      }
    }

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
    const items = this.store.queryAll({ pk, sk: { operator: 'begins_with', value: prefix } });

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
    return [...all].sort((a, b) => b.care - a.care).slice(0, limit);
  }

  /** GSI3（GSI-TOPIC）相当を `GSI3PK` 属性の配列フィルタで再現する。 */
  private async queryGsi3(userId: string, characterId: string): Promise<TopicEntity[]> {
    const gsi3pk = buildTopicGSI3PK(characterId, userId);
    const items = this.store.queryAllByAttribute({
      attributeName: 'GSI3PK',
      attributeValue: gsi3pk,
      projection: TOPIC_GSI_PROJECTION,
      // sk条件を指定しないため、実DynamoDBのGSI3 Queryと同様にGSI3SK（Care、Number型）昇順で
      // 返すよう明示する。sortBySortKeyはNumber型ソートキーを数値比較するため、実際に数値順になる。
      gsiSortKeyAttributeName: 'GSI3SK',
    });
    return items.map((item) => this.topicMapper.toEntity(item));
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
    const items = this.store.queryAll({ pk, sk: { operator: 'begins_with', value: prefix } });
    return items.map((item: DynamoDBAttributes) => this.selfFactMapper.toEntity(item));
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
    const items = this.store.queryAll({ pk, sk: { operator: 'begins_with', value: prefix } });
    return items.map((item: DynamoDBAttributes) => this.webFactMapper.toEntity(item));
  }

  public async listStaleWebFacts(
    userId: string,
    characterId: string,
    nowMs: number,
    limit: number
  ): Promise<WebFactEntity[]> {
    // GSI4（GSI-STALE）相当を `GSI4PK` 属性の配列フィルタで再現し、
    // NextReview<=nowMs のフィルタ・昇順ソート・limit の slice で窓走査を再現する
    // （queryGsi3 と同じ方針）。
    const gsi4pk = buildTopicStaleGSI4PK(characterId, userId);
    const items = this.store.queryAllByAttribute({
      attributeName: 'GSI4PK',
      attributeValue: gsi4pk,
      projection: STALE_GSI_PROJECTION,
      // sk条件を指定しないため、実DynamoDBのGSI4 Queryと同様にGSI4SK（NextReview、Number型）昇順で
      // 返すよう明示する。sortBySortKeyはNumber型ソートキーを数値比較するため、実際に数値順になる
      // （最終的な昇順ソートはこの後のJS側.sort()でも重ねて行うが、結果は同じになる）。
      gsiSortKeyAttributeName: 'GSI4SK',
    });
    const results = items.map((item) => this.webFactMapper.toEntity(item));

    return results
      .filter((fact) => fact.nextReview !== undefined && fact.nextReview <= nowMs)
      .sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0))
      .slice(0, limit);
  }

  public async updateWebFactNextReview(key: WebFactKey, nextReview: number): Promise<void> {
    try {
      await this.webFactStore.update(key, { nextReview });
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        logger.warn(
          '[InMemoryTopicRepository] updateWebFactNextReview: 対象 WEB fact が存在しません',
          { key }
        );
        return;
      }
      throw error;
    }
  }
}
