/**
 * Stock Tracker Core - Watchlist Repository
 *
 * ウォッチリストデータの CRUD 操作を提供
 */

import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { Watchlist, DynamoDBItem } from '../types.js';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  WATCHLIST_NOT_FOUND: 'ウォッチリストが見つかりません',
  INVALID_WATCHLIST_DATA: 'ウォッチリストデータが無効です',
  WATCHLIST_ALREADY_EXISTS: 'ウォッチリストは既に存在します',
  DATABASE_ERROR: 'データベースエラーが発生しました',
} as const;

// カスタムエラークラス
export class WatchlistNotFoundError extends Error {
  constructor(userId: string, tickerId: string) {
    super(`${ERROR_MESSAGES.WATCHLIST_NOT_FOUND}: UserID=${userId}, TickerID=${tickerId}`);
    this.name = 'WatchlistNotFoundError';
  }
}

export class InvalidWatchlistDataError extends Error {
  constructor(message: string) {
    super(`${ERROR_MESSAGES.INVALID_WATCHLIST_DATA}: ${message}`);
    this.name = 'InvalidWatchlistDataError';
  }
}

export class WatchlistAlreadyExistsError extends Error {
  constructor(userId: string, tickerId: string) {
    super(`${ERROR_MESSAGES.WATCHLIST_ALREADY_EXISTS}: UserID=${userId}, TickerID=${tickerId}`);
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
export class WatchlistRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  /**
   * ユーザーのウォッチリスト一覧を取得
   *
   * GSI1 (UserIndex) を使用してユーザーごとのウォッチリストを取得
   *
   * @param userId - ユーザーID
   * @param limit - 取得件数の上限（デフォルト: 50）
   * @param lastKey - ページネーション用の最後のキー
   * @returns ウォッチリストの配列と次のページのキー
   */
  async getByUserId(
    userId: string,
    limit: number = 50,
    lastKey?: Record<string, unknown>
  ): Promise<WatchlistQueryResult> {
    try {
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'UserIndex',
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': userId,
            ':sk': 'Watchlist#',
          },
          Limit: limit,
          ExclusiveStartKey: lastKey,
        })
      );

      if (!result.Items || result.Items.length === 0) {
        return {
          items: [],
          lastKey: undefined,
        };
      }

      return {
        items: result.Items.map((item) => this.mapDynamoDBItemToWatchlist(item)),
        lastKey: result.LastEvaluatedKey,
      };
    } catch (error) {
      if (error instanceof InvalidWatchlistDataError) {
        throw error;
      }
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 単一のウォッチリストを取得
   *
   * @param userId - ユーザーID
   * @param tickerId - ティッカーID
   * @returns ウォッチリスト（存在しない場合はnull）
   */
  async getById(userId: string, tickerId: string): Promise<Watchlist | null> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            PK: `USER#${userId}`,
            SK: `WATCHLIST#${tickerId}`,
          },
        })
      );

      if (!result.Item) {
        return null;
      }

      return this.mapDynamoDBItemToWatchlist(result.Item);
    } catch (error) {
      if (error instanceof InvalidWatchlistDataError) {
        throw error;
      }
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 新しいウォッチリストを作成
   *
   * @param watchlist - ウォッチリストデータ（UserID, TickerID, ExchangeID）
   * @returns 作成されたウォッチリスト（CreatedAtを含む）
   */
  async create(watchlist: Omit<Watchlist, 'CreatedAt'>): Promise<Watchlist> {
    try {
      const now = Date.now();
      const newWatchlist: Watchlist = {
        ...watchlist,
        CreatedAt: now,
      };

      const item: DynamoDBItem & Watchlist = {
        PK: `USER#${newWatchlist.UserID}`,
        SK: `WATCHLIST#${newWatchlist.TickerID}`,
        Type: 'Watchlist',
        GSI1PK: newWatchlist.UserID,
        GSI1SK: `Watchlist#${newWatchlist.TickerID}`,
        ...newWatchlist,
      };

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      return newWatchlist;
    } catch (error) {
      // ConditionalCheckFailedException を特定してカスタムエラーにマップ
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new WatchlistAlreadyExistsError(watchlist.UserID, watchlist.TickerID);
      }
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * ウォッチリストを削除
   *
   * @param userId - ユーザーID
   * @param tickerId - ティッカーID
   * @throws WatchlistNotFoundError ウォッチリストが存在しない場合
   */
  async delete(userId: string, tickerId: string): Promise<void> {
    try {
      // 存在確認
      const existing = await this.getById(userId, tickerId);
      if (!existing) {
        throw new WatchlistNotFoundError(userId, tickerId);
      }

      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: {
            PK: `USER#${userId}`,
            SK: `WATCHLIST#${tickerId}`,
          },
          ConditionExpression: 'attribute_exists(PK)',
        })
      );
    } catch (error) {
      if (error instanceof WatchlistNotFoundError) {
        throw error;
      }
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * DynamoDB Item を Watchlist にマッピング
   *
   * @param item - DynamoDB Item
   * @returns Watchlist
   */
  private mapDynamoDBItemToWatchlist(item: Record<string, unknown>): Watchlist {
    // フィールドのバリデーション
    const userId = item.UserID;
    if (typeof userId !== 'string' || userId.length === 0) {
      throw new InvalidWatchlistDataError('フィールド "UserID" が不正です');
    }

    const tickerId = item.TickerID;
    if (typeof tickerId !== 'string' || tickerId.length === 0) {
      throw new InvalidWatchlistDataError('フィールド "TickerID" が不正です');
    }

    const exchangeId = item.ExchangeID;
    if (typeof exchangeId !== 'string' || exchangeId.length === 0) {
      throw new InvalidWatchlistDataError('フィールド "ExchangeID" が不正です');
    }

    const createdAt = item.CreatedAt;
    if (typeof createdAt !== 'number') {
      throw new InvalidWatchlistDataError('フィールド "CreatedAt" が不正です');
    }

    const watchlist: Watchlist = {
      UserID: userId,
      TickerID: tickerId,
      ExchangeID: exchangeId,
      CreatedAt: createdAt,
    };
    return watchlist;
  }
}
