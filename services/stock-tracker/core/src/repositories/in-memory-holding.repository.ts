/**
 * Stock Tracker Core - InMemory Holding Repository
 *
 * InMemorySingleTableStoreを使用したHoldingRepositoryの実装
 */

import {
  InMemoryEntityStore,
  type EntityStore,
  type InMemorySingleTableStore,
  type PaginationOptions,
  type PaginatedResult,
} from '@nagiyu/aws';
import type { HoldingRepository } from './holding.repository.interface.js';
import type {
  HoldingEntity,
  HoldingKey,
  CreateHoldingInput,
  UpdateHoldingInput,
} from '../entities/holding.entity.js';
import {
  HoldingMapper,
  HOLDING_GSI1_SK_PREFIX,
  buildHoldingGsi1Pk,
} from '../mappers/holding.mapper.js';

// 実DynamoDB実装（dynamodb-holding.repository.ts）はgetByUserIdのlimit未指定時に
// 50件を既定とするため、InMemory実装もこれに合わせる（store既定の100件のままだと乖離する）。
//
// 実DynamoDB実装と同じFalsyフォールバック（`options?.limit || DEFAULT_GET_BY_USER_ID_LIMIT`）
// にする。Nullishフォールバック（`??`）にすると、limit: 0 がstoreの
// `options?.limit || 100`まで素通りして100件にフォールバックしてしまうため。
const DEFAULT_GET_BY_USER_ID_LIMIT = 50;

/**
 * InMemory Holding Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、GSI の近似クエリだけを自前で持つ。
 * テスト環境で使用
 */
export class InMemoryHoldingRepository implements HoldingRepository {
  private readonly store: InMemorySingleTableStore;
  private readonly mapper = new HoldingMapper();
  private readonly entityStore: EntityStore<HoldingEntity, HoldingKey>;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper);
  }

  /**
   * ユーザーIDとティッカーIDで単一の保有株式を取得
   */
  public async getById(userId: string, tickerId: string): Promise<HoldingEntity | null> {
    return this.entityStore.get({ userId, tickerId });
  }

  /**
   * ユーザーの保有株式一覧を取得
   */
  public async getByUserId(
    userId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<HoldingEntity>> {
    const result = this.store.queryByAttribute(
      {
        attributeName: 'GSI1PK',
        attributeValue: buildHoldingGsi1Pk(userId),
        sk: {
          attributeName: 'GSI1SK',
          operator: 'begins_with',
          value: HOLDING_GSI1_SK_PREFIX,
        },
      },
      {
        ...options,
        limit: options?.limit || DEFAULT_GET_BY_USER_ID_LIMIT,
      }
    );

    const items = result.items.map((item) => this.mapper.toEntity(item));

    return {
      items,
      nextCursor: result.nextCursor,
      count: result.count,
    };
  }

  /**
   * 新しい保有株式を作成
   */
  public async create(input: CreateHoldingInput): Promise<HoldingEntity> {
    return this.entityStore.create(input);
  }

  /**
   * 保有株式を更新
   */
  public async update(
    userId: string,
    tickerId: string,
    updates: UpdateHoldingInput
  ): Promise<HoldingEntity> {
    return this.entityStore.update({ userId, tickerId }, updates);
  }

  /**
   * 保有株式を削除
   */
  public async delete(userId: string, tickerId: string): Promise<void> {
    await this.entityStore.delete({ userId, tickerId });
  }
}
