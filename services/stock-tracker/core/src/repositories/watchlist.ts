/**
 * Stock Tracker Core - Watchlist Repository
 *
 * ウォッチリストデータの CRUD 操作を提供
 */

import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  AbstractDynamoDBRepository,
  EntityNotFoundError,
  EntityAlreadyExistsError,
  InvalidEntityDataError,
  validateStringField,
  validateNumberField,
  validateTimestampField,
  type DynamoDBItem,
} from '@nagiyu/aws';
import type { Watchlist } from '../types.js';

// 互換性のためのエラークラスエイリアス
export class WatchlistNotFoundError extends EntityNotFoundError {
  constructor(userId: string, tickerId: string) {
    super('Watchlist', `UserID=${userId}, TickerID=${tickerId}`);
    this.name = 'WatchlistNotFoundError';
  }
}

export class InvalidWatchlistDataError extends InvalidEntityDataError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWatchlistDataError';
  }
}

export class WatchlistAlreadyExistsError extends EntityAlreadyExistsError {
  constructor(userId: string, tickerId: string) {
    super('Watchlist', `UserID=${userId}, TickerID=${tickerId}`);
    this.name = 'WatchlistAlreadyExistsError';
  }
}

/**
 * ページネーション用の結果型
 */
export type WatchlistQueryResult = {
  items: Watchlist[];
  lastKey?: Record<string, unknown>;
};

/**
 * Watchlist リポジトリ
 *
 * DynamoDB Single Table Design に基づくウォッチリストデータの CRUD 操作
 */
export class WatchlistRepository extends AbstractDynamoDBRepository<
  Watchlist,
  { userId: string; tickerId: string }
> {
  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    super(docClient, {
      tableName,
      entityType: 'Watchlist',
    });
  }

  /**
   * PK/SK を構築
   */
  protected buildKeys(key: { userId: string; tickerId: string }): { PK: string; SK: string } {
    return {
      PK: `USER#${key.userId}`,
      SK: `WATCHLIST#${key.tickerId}`,
    };
  }

  /**
   * DynamoDB Item を Watchlist にマッピング
   */
  protected mapToEntity(item: Record<string, unknown>): Watchlist {
    try {
      return {
        UserID: validateStringField(item.UserID, 'UserID'),
        TickerID: validateStringField(item.TickerID, 'TickerID'),
        ExchangeID: validateStringField(item.ExchangeID, 'ExchangeID'),
        CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      };
    } catch (error) {
      if (error instanceof InvalidEntityDataError) {
        throw new InvalidWatchlistDataError(
          error.message.replace('エンティティデータが無効です: ', '')
        );
      }
      throw error;
    }
  }

  /**
   * Watchlist を DynamoDB Item にマッピング
   */
  protected mapToItem(watchlist: Omit<Watchlist, 'CreatedAt'>): Omit<DynamoDBItem, 'CreatedAt' | 'UpdatedAt'> {
    const keys = this.buildKeys({ userId: watchlist.UserID, tickerId: watchlist.TickerID });
    return {
      ...keys,
      Type: this.config.entityType,
      GSI1PK: watchlist.UserID,
      GSI1SK: `Watchlist#${watchlist.TickerID}`,
      UserID: watchlist.UserID,
      TickerID: watchlist.TickerID,
      ExchangeID: watchlist.ExchangeID,
    };
  }

  /**
   * ID でエンティティを取得（オーバーライド: 2パラメータサポート）
   */
  async getById(key: { userId: string; tickerId: string }): Promise<Watchlist | null>;
  async getById(userId: string, tickerId: string): Promise<Watchlist | null>;
  async getById(
    keyOrUserId: { userId: string; tickerId: string } | string,
    tickerId?: string
  ): Promise<Watchlist | null> {
    try {
      const key =
        typeof keyOrUserId === 'string' && tickerId !== undefined
          ? { userId: keyOrUserId, tickerId }
          : (keyOrUserId as { userId: string; tickerId: string });

      return await super.getById(key);
    } catch (error) {
      if (error instanceof InvalidEntityDataError) {
        throw new InvalidWatchlistDataError(
          error.message.replace('エンティティデータが無効です: ', '')
        );
      }
      throw error;
    }
  }

  /**
   * ユーザーのウォッチリスト一覧を取得
   */
  async getByUserId(
    userId: string,
    limit: number = 50,
    lastKey?: Record<string, unknown>
  ): Promise<WatchlistQueryResult> {
    try {
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.config.tableName,
          IndexName: 'UserIndex',
          KeyConditionExpression: '#gsi1pk = :userId AND begins_with(#gsi1sk, :prefix)',
          ExpressionAttributeNames: {
            '#gsi1pk': 'GSI1PK',
            '#gsi1sk': 'GSI1SK',
          },
          ExpressionAttributeValues: {
            ':userId': userId,
            ':prefix': 'Watchlist#',
          },
          Limit: limit,
          ExclusiveStartKey: lastKey,
        })
      );

      if (!result.Items || result.Items.length === 0) {
        return { items: [] };
      }

      const items = result.Items.map((item) => this.mapToEntity(item));

      return {
        items,
        lastKey: result.LastEvaluatedKey,
      };
    } catch (error) {
      if (error instanceof InvalidWatchlistDataError) {
        throw error;
      }
      throw new Error(
        `データベースエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * ウォッチリストを作成（オーバーライド: エラーラッピング）
   */
  async create(watchlist: Omit<Watchlist, 'CreatedAt'>): Promise<Watchlist> {
    try {
      // Base class expects Omit<TEntity, 'CreatedAt' | 'UpdatedAt'>, but Watchlist doesn't have UpdatedAt
      // So we pass it as-is and let the base class add both timestamps
      const result = await super.create(watchlist as any);
      // Return only the fields that Watchlist type includes
      const { UpdatedAt, ...watchlistData } = result as any;
      return watchlistData as Watchlist;
    } catch (error) {
      if (error instanceof EntityAlreadyExistsError) {
        throw new WatchlistAlreadyExistsError(watchlist.UserID, watchlist.TickerID);
      }
      throw error;
    }
  }

  /**
   * ウォッチリストを削除
   */
  async delete(userId: string, tickerId: string): Promise<void> {
    try {
      // 存在確認
      const existing = await this.getById(userId, tickerId);
      if (!existing) {
        throw new WatchlistNotFoundError(userId, tickerId);
      }

      await super.delete({ userId, tickerId });
    } catch (error) {
      if (error instanceof WatchlistNotFoundError) {
        throw error;
      }
      if (error instanceof EntityNotFoundError) {
        throw new WatchlistNotFoundError(userId, tickerId);
      }
      throw error;
    }
  }
}
