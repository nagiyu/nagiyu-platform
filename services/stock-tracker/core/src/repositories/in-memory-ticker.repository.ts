/**
 * Stock Tracker Core - InMemory Ticker Repository
 *
 * InMemorySingleTableStoreを使用したTickerRepositoryの実装
 */

import {
  InMemorySingleTableStore,
  EntityNotFoundError,
  EntityAlreadyExistsError,
  DatabaseError,
  type PaginationOptions,
  type PaginatedResult,
} from '@nagiyu/aws';
import type { TickerRepository } from './ticker.repository.interface.js';
import type {
  TickerEntity,
  CreateTickerInput,
  UpdateTickerInput,
} from '../entities/ticker.entity.js';
import { TickerMapper } from '../mappers/ticker.mapper.js';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  NO_UPDATES_SPECIFIED: '更新するフィールドが指定されていません',
} as const;

/**
 * InMemory Ticker Repository
 *
 * InMemorySingleTableStoreを使用したティッカーリポジトリの実装
 * テスト環境で使用
 */
export class InMemoryTickerRepository implements TickerRepository {
  private readonly mapper: TickerMapper;

  constructor(private readonly store: InMemorySingleTableStore) {
    this.mapper = new TickerMapper();
  }

  /**
   * ティッカーIDで単一のティッカーを取得
   */
  async getById(tickerId: string): Promise<TickerEntity | null> {
    const { pk, sk } = this.mapper.buildKeys({ tickerId });
    const item = this.store.get(pk, sk);

    if (!item) {
      return null;
    }

    return this.mapper.toEntity(item);
  }

  /**
   * 取引所ごとのティッカー一覧を取得
   */
  async getByExchange(
    exchangeId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<TickerEntity>> {
    const result = this.store.queryByAttribute(
      {
        attributeName: 'GSI3PK',
        attributeValue: exchangeId,
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
   * 全ティッカー取得
   */
  async getAll(options?: PaginationOptions): Promise<PaginatedResult<TickerEntity>> {
    const result = this.store.scan(
      {
        attributeName: 'Type',
        attributeValue: 'Ticker',
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
   * 新しいティッカーを作成
   */
  async create(input: CreateTickerInput): Promise<TickerEntity> {
    const now = Date.now();
    const entity: TickerEntity = {
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
   * ティッカーを更新
   */
  async update(tickerId: string, updates: UpdateTickerInput): Promise<TickerEntity> {
    // 更新するフィールドがない場合はエラー
    if (Object.keys(updates).length === 0) {
      throw new DatabaseError(ERROR_MESSAGES.NO_UPDATES_SPECIFIED);
    }

    const { pk, sk } = this.mapper.buildKeys({ tickerId });
    const existingItem = this.store.get(pk, sk);

    if (!existingItem) {
      throw new EntityNotFoundError('Ticker', tickerId);
    }

    const existingEntity = this.mapper.toEntity(existingItem);
    const now = Date.now();

    // 更新を適用
    const updatedEntity: TickerEntity = {
      ...existingEntity,
      ...updates,
      UpdatedAt: now,
    };

    const updatedItem = this.mapper.toItem(updatedEntity);
    this.store.put(updatedItem);

    return updatedEntity;
  }

  /**
   * ティッカーを削除
   */
  async delete(tickerId: string): Promise<void> {
    const { pk, sk } = this.mapper.buildKeys({ tickerId });

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
