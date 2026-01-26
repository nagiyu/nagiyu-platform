/**
 * Stock Tracker Core - InMemory Holding Repository
 *
 * InMemorySingleTableStoreを使用したHoldingRepositoryの実装
 */

import {
  InMemorySingleTableStore,
  EntityNotFoundError,
  EntityAlreadyExistsError,
  DatabaseError,
  type PaginationOptions,
  type PaginatedResult,
} from '@nagiyu/aws';
import type { HoldingRepository } from './holding.repository.interface.js';
import type { HoldingEntity, CreateHoldingInput, UpdateHoldingInput } from '../entities/holding.entity.js';
import { HoldingMapper } from '../mappers/holding.mapper.js';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  NO_UPDATES_SPECIFIED: '更新するフィールドが指定されていません',
} as const;

/**
 * InMemory Holding Repository
 *
 * InMemorySingleTableStoreを使用した保有株式リポジトリの実装
 * テスト環境で使用
 */
export class InMemoryHoldingRepository implements HoldingRepository {
  private readonly mapper: HoldingMapper;

  constructor(private readonly store: InMemorySingleTableStore) {
    this.mapper = new HoldingMapper();
  }

  /**
   * ユーザーIDとティッカーIDで単一の保有株式を取得
   */
  async getById(userId: string, tickerId: string): Promise<HoldingEntity | null> {
    const { pk, sk } = this.mapper.buildKeys({ userId, tickerId });
    const item = this.store.get(pk, sk);

    if (!item) {
      return null;
    }

    return this.mapper.toEntity(item);
  }

  /**
   * ユーザーの保有株式一覧を取得
   */
  async getByUserId(
    userId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<HoldingEntity>> {
    const result = this.store.queryByAttribute(
      {
        attributeName: 'GSI1PK',
        attributeValue: userId,
        sk: {
          attributeName: 'GSI1SK',
          operator: 'begins_with',
          value: 'Holding#',
        },
      },
      options
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
  async create(input: CreateHoldingInput): Promise<HoldingEntity> {
    const now = Date.now();
    const entity: HoldingEntity = {
      ...input,
      CreatedAt: now,
      UpdatedAt: now,
    };

    const item = this.mapper.toItem(entity);

    try {
      this.store.put(item, { attributeNotExists: true });
      return entity;
    } catch (error) {
      // EntityAlreadyExistsError はそのまま投げる
      if (error instanceof EntityAlreadyExistsError) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * 保有株式を更新
   */
  async update(
    userId: string,
    tickerId: string,
    updates: UpdateHoldingInput
  ): Promise<HoldingEntity> {
    // 更新するフィールドがない場合はエラー
    if (Object.keys(updates).length === 0) {
      throw new DatabaseError(ERROR_MESSAGES.NO_UPDATES_SPECIFIED);
    }

    const { pk, sk } = this.mapper.buildKeys({ userId, tickerId });
    const existingItem = this.store.get(pk, sk);

    if (!existingItem) {
      throw new EntityNotFoundError('Holding', `${userId}#${tickerId}`);
    }

    const existingEntity = this.mapper.toEntity(existingItem);
    const now = Date.now();

    // 更新を適用
    const updatedEntity: HoldingEntity = {
      ...existingEntity,
      ...updates,
      UpdatedAt: now,
    };

    const updatedItem = this.mapper.toItem(updatedEntity);
    this.store.put(updatedItem);

    return updatedEntity;
  }

  /**
   * 保有株式を削除
   */
  async delete(userId: string, tickerId: string): Promise<void> {
    const { pk, sk } = this.mapper.buildKeys({ userId, tickerId });

    try {
      this.store.delete(pk, sk, { attributeExists: true });
    } catch (error) {
      // EntityNotFoundError はそのまま投げる
      if (error instanceof EntityNotFoundError) {
        throw error;
      }
      throw error;
    }
  }
}
