/**
 * Stock Tracker Core - InMemory Watchlist Repository
 *
 * InMemorySingleTableStoreを使用したWatchlistRepositoryの実装
 */

import {
  InMemorySingleTableStore,
  EntityAlreadyExistsError,
  type PaginationOptions,
  type PaginatedResult,
} from '@nagiyu/aws';
import type { WatchlistRepository } from './watchlist.repository.interface.js';
import type { WatchlistEntity, CreateWatchlistInput } from '../entities/watchlist.entity.js';
import { WatchlistMapper } from '../mappers/watchlist.mapper.js';
import { WatchlistAlreadyExistsError, WatchlistNotFoundError } from './dynamodb-watchlist.repository.js';

/**
 * InMemory Watchlist Repository
 *
 * InMemorySingleTableStoreを使用したウォッチリストリポジトリの実装
 * テスト環境で使用
 */
export class InMemoryWatchlistRepository implements WatchlistRepository {
  private readonly mapper: WatchlistMapper;
  private readonly store: InMemorySingleTableStore;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.mapper = new WatchlistMapper();
  }

  /**
   * ユーザーIDとティッカーIDで単一のウォッチリストを取得
   */
  public async getById(userId: string, tickerId: string): Promise<WatchlistEntity | null> {
    const { pk, sk } = this.mapper.buildKeys({ userId, tickerId });
    const item = this.store.get(pk, sk);

    if (!item) {
      return null;
    }

    return this.mapper.toEntity(item);
  }

  /**
   * ユーザーのウォッチリスト一覧を取得
   */
  public async getByUserId(
    userId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<WatchlistEntity>> {
    const result = this.store.queryByAttribute(
      {
        attributeName: 'GSI1PK',
        attributeValue: userId,
        sk: {
          attributeName: 'GSI1SK',
          operator: 'begins_with',
          value: 'Watchlist#',
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
   * 新しいウォッチリストを作成
   */
  public async create(input: CreateWatchlistInput): Promise<WatchlistEntity> {
    const now = Date.now();
    const entity: WatchlistEntity = {
      ...input,
      CreatedAt: now,
    };

    const item = this.mapper.toItem(entity);

    try {
      this.store.put(item, { attributeNotExists: true });
      return entity;
    } catch (error) {
      // EntityAlreadyExistsError を WatchlistAlreadyExistsError に変換
      if (error instanceof EntityAlreadyExistsError) {
        throw new WatchlistAlreadyExistsError(input.UserID, input.TickerID);
      }
      throw error;
    }
  }

  /**
   * ウォッチリストを削除
   */
  public async delete(userId: string, tickerId: string): Promise<void> {
    const { pk, sk } = this.mapper.buildKeys({ userId, tickerId });

    // 存在チェック
    const item = this.store.get(pk, sk);
    if (!item) {
      throw new WatchlistNotFoundError(userId, tickerId);
    }

    this.store.delete(pk, sk);
  }
}
