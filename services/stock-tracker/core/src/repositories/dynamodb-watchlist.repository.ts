/**
 * Stock Tracker Core - DynamoDB Watchlist Repository
 *
 * DynamoDBを使用したWatchlistRepositoryの実装
 */

import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  EntityNotFoundError,
  EntityAlreadyExistsError,
  DatabaseError,
  InvalidEntityDataError,
  type PaginationOptions,
  type PaginatedResult,
  type DynamoDBItem,
} from '@nagiyu/aws';
import type { WatchlistRepository } from './watchlist.repository.interface.js';
import type {
  WatchlistEntity,
  CreateWatchlistInput,
} from '../entities/watchlist.entity.js';
import { WatchlistMapper } from '../mappers/watchlist.mapper.js';

// カスタムエラークラス（互換性のため維持）
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
 * DynamoDB Watchlist Repository
 *
 * DynamoDBを使用したウォッチリストリポジトリの実装
 */
export class DynamoDBWatchlistRepository implements WatchlistRepository {
  private readonly mapper: WatchlistMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.mapper = new WatchlistMapper();
  }

  /**
   * ユーザーIDとティッカーIDで単一のウォッチリストを取得
   */
  public async getById(userId: string, tickerId: string): Promise<WatchlistEntity | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ userId, tickerId });

      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
        })
      );

      if (!result.Item) {
        return null;
      }

      return this.mapper.toEntity(result.Item as unknown as DynamoDBItem);
    } catch (error) {
      if (error instanceof InvalidEntityDataError) {
        throw new InvalidWatchlistDataError(
          error.message.replace('エンティティデータが無効です: ', '')
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * ユーザーのウォッチリスト一覧を取得（GSI1使用）
   */
  public async getByUserId(
    userId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<WatchlistEntity>> {
    try {
      const limit = options?.limit || 50;
      const exclusiveStartKey = options?.cursor
        ? JSON.parse(Buffer.from(options.cursor, 'base64').toString('utf-8'))
        : undefined;

      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
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
          ExclusiveStartKey: exclusiveStartKey,
        })
      );

      const items = (result.Items || []).map((item) =>
        this.mapper.toEntity(item as unknown as DynamoDBItem)
      );
      const nextCursor = result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : undefined;

      return {
        items,
        nextCursor,
        count: result.Count ?? 0,
      };
    } catch (error) {
      if (error instanceof InvalidWatchlistDataError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 新しいウォッチリストを作成
   */
  public async create(input: CreateWatchlistInput): Promise<WatchlistEntity> {
    try {
      const now = Date.now();
      const entity: WatchlistEntity = {
        ...input,
        CreatedAt: now,
      };

      const item = this.mapper.toItem(entity);

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      return entity;
    } catch (error) {
      // 条件付き保存の失敗（既存アイテムが存在）
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new WatchlistAlreadyExistsError(input.UserID, input.TickerID);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * ウォッチリストを削除
   */
  public async delete(userId: string, tickerId: string): Promise<void> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ userId, tickerId });

      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          ConditionExpression: 'attribute_exists(PK)',
        })
      );
    } catch (error) {
      // 条件チェック失敗（アイテムが存在しない）
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new WatchlistNotFoundError(userId, tickerId);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
