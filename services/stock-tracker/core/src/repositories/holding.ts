/**
 * Stock Tracker Core - Holding Repository
 *
 * 保有株式データの CRUD 操作を提供
 */

import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  AbstractDynamoDBRepository,
  EntityNotFoundError,
  EntityAlreadyExistsError,
  InvalidEntityDataError,
  DatabaseError,
  validateStringField,
  validateNumberField,
  validateTimestampField,
  type DynamoDBItem,
} from '@nagiyu/aws';
import type { Holding } from '../types.js';

// 互換性のためのエラークラス
export class HoldingNotFoundError extends Error {
  constructor(userId: string, tickerId: string) {
    super(`保有株式が見つかりません: UserID=${userId} TickerID=${tickerId}`);
    this.name = 'HoldingNotFoundError';
  }
}

export class InvalidHoldingDataError extends Error {
  constructor(message: string) {
    super(`保有株式データが無効です: ${message}`);
    this.name = 'InvalidHoldingDataError';
  }
}

export class HoldingAlreadyExistsError extends Error {
  constructor(userId: string, tickerId: string) {
    super(`保有株式は既に存在します: UserID=${userId} TickerID=${tickerId}`);
    this.name = 'HoldingAlreadyExistsError';
  }
}

/**
 * ページネーション結果
 */
export type PaginatedHoldings = {
  items: Holding[];
  lastKey?: { PK: string; SK: string };
};

/**
 * Holding リポジトリ
 *
 * DynamoDB Single Table Design に基づく保有株式データの CRUD 操作
 */
export class HoldingRepository extends AbstractDynamoDBRepository<
  Holding,
  { userId: string; tickerId: string }
> {
  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    super(docClient, {
      tableName,
      entityType: 'Holding',
    });
  }

  /**
   * PK/SK を構築
   */
  protected buildKeys(key: { userId: string; tickerId: string }): { PK: string; SK: string } {
    return {
      PK: `USER#${key.userId}`,
      SK: `HOLDING#${key.tickerId}`,
    };
  }

  /**
   * DynamoDB Item を Holding にマッピング
   */
  protected mapToEntity(item: Record<string, unknown>): Holding {
    return {
      UserID: validateStringField(item.UserID, 'UserID'),
      TickerID: validateStringField(item.TickerID, 'TickerID'),
      ExchangeID: validateStringField(item.ExchangeID, 'ExchangeID'),
      Quantity: validateNumberField(item.Quantity, 'Quantity'),
      AveragePrice: validateNumberField(item.AveragePrice, 'AveragePrice'),
      Currency: validateStringField(item.Currency, 'Currency'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
  }

  /**
   * Holding を DynamoDB Item にマッピング
   */
  protected mapToItem(
    holding: Omit<Holding, 'CreatedAt' | 'UpdatedAt'>
  ): Omit<DynamoDBItem, 'CreatedAt' | 'UpdatedAt'> {
    const keys = this.buildKeys({ userId: holding.UserID, tickerId: holding.TickerID });
    return {
      ...keys,
      Type: this.config.entityType,
      GSI1PK: holding.UserID,
      GSI1SK: `Holding#${holding.TickerID}`,
      UserID: holding.UserID,
      TickerID: holding.TickerID,
      ExchangeID: holding.ExchangeID,
      Quantity: holding.Quantity,
      AveragePrice: holding.AveragePrice,
      Currency: holding.Currency,
    };
  }

  /**
   * ユーザーの保有株式一覧を取得（GSI1使用）
   *
   * @param userId - ユーザーID
   * @param limit - 取得件数の上限（デフォルト: 50）
   * @param lastKey - ページネーション用の最終キー
   * @returns ページネーション結果（保有株式の配列と次のページキー）
   */
  async getByUserId(
    userId: string,
    limit: number = 50,
    lastKey?: { PK: string; SK: string }
  ): Promise<PaginatedHoldings> {
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
            ':prefix': 'Holding#',
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
        lastKey: result.LastEvaluatedKey as { PK: string; SK: string } | undefined,
      };
    } catch (error) {
      if (error instanceof InvalidHoldingDataError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`データベースエラーが発生しました: ${message}`);
    }
  }

  /**
   * ユーザーIDとティッカーIDで単一の保有株式を取得（基底クラスのシグネチャ）
   */
  async getById(key: { userId: string; tickerId: string }): Promise<Holding | null>;
  /**
   * ユーザーIDとティッカーIDで単一の保有株式を取得（互換性のある2パラメータ版）
   */
  async getById(userId: string, tickerId: string): Promise<Holding | null>;
  /**
   * ユーザーIDとティッカーIDで単一の保有株式を取得の実装
   */
  async getById(
    keyOrUserId: { userId: string; tickerId: string } | string,
    tickerId?: string
  ): Promise<Holding | null> {
    try {
      const key =
        typeof keyOrUserId === 'string' && tickerId !== undefined
          ? { userId: keyOrUserId, tickerId }
          : (keyOrUserId as { userId: string; tickerId: string });

      return await super.getById(key);
    } catch (error) {
      // InvalidHoldingDataErrorは そのまま投げる
      if (error instanceof InvalidHoldingDataError) {
        throw error;
      }
      if (error instanceof InvalidEntityDataError) {
        throw new InvalidHoldingDataError(
          error.message.replace('エンティティデータが無効です: ', '')
        );
      }
      if (error instanceof DatabaseError) {
        const originalError = error.cause || error;
        const message =
          originalError instanceof Error ? originalError.message : String(originalError);
        throw new Error(`データベースエラーが発生しました: ${message}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`データベースエラーが発生しました: ${message}`);
    }
  }

  /**
   * 新しい保有株式を作成
   *
   * @param holding - 保有株式データ（UserID, TickerID, ExchangeID, Quantity, AveragePrice, Currency）
   * @returns 作成された保有株式（CreatedAt, UpdatedAtを含む）
   */
  async create(holding: Omit<Holding, 'CreatedAt' | 'UpdatedAt'>): Promise<Holding> {
    try {
      return await super.create(holding);
    } catch (error) {
      if (error instanceof EntityAlreadyExistsError) {
        throw new HoldingAlreadyExistsError(holding.UserID, holding.TickerID);
      }
      if (error instanceof DatabaseError) {
        const originalError = error.cause || error;
        const message =
          originalError instanceof Error ? originalError.message : String(originalError);
        throw new Error(`データベースエラーが発生しました: ${message}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`データベースエラーが発生しました: ${message}`);
    }
  }

  /**
   * 保有株式を更新（基底クラスのシグネチャ）
   */
  async update(
    key: { userId: string; tickerId: string },
    updates: Partial<Holding>
  ): Promise<Holding>;
  /**
   * 保有株式を更新（互換性のある3パラメータ版）
   */
  async update(
    userId: string,
    tickerId: string,
    updates: Partial<Pick<Holding, 'Quantity' | 'AveragePrice' | 'Currency'>>
  ): Promise<Holding>;
  /**
   * 保有株式を更新の実装
   */
  async update(
    keyOrUserId: { userId: string; tickerId: string } | string,
    tickerIdOrUpdates?: string | Partial<Holding>,
    updates?: Partial<Pick<Holding, 'Quantity' | 'AveragePrice' | 'Currency'>>
  ): Promise<Holding> {
    try {
      let userId: string;
      let tickerId: string;
      let actualUpdates: Partial<Holding>;

      if (typeof keyOrUserId === 'string') {
        // 3-parameter version: (userId, tickerId, updates)
        userId = keyOrUserId;
        tickerId = tickerIdOrUpdates as string;
        actualUpdates = updates as Partial<Pick<Holding, 'Quantity' | 'AveragePrice' | 'Currency'>>;
      } else {
        // 2-parameter version: (key, updates)
        userId = keyOrUserId.userId;
        tickerId = keyOrUserId.tickerId;
        actualUpdates = tickerIdOrUpdates as Partial<Holding>;
      }

      // 存在確認
      const existing = await this.getById(userId, tickerId);
      if (!existing) {
        throw new HoldingNotFoundError(userId, tickerId);
      }

      // 更新するフィールドが指定されていない場合はエラー
      if (Object.keys(actualUpdates).length === 0) {
        throw new InvalidHoldingDataError('更新するフィールドが指定されていません');
      }

      return await super.update({ userId, tickerId }, actualUpdates);
    } catch (error) {
      if (error instanceof HoldingNotFoundError || error instanceof InvalidHoldingDataError) {
        throw error;
      }
      if (error instanceof EntityNotFoundError) {
        const userId = typeof keyOrUserId === 'string' ? keyOrUserId : keyOrUserId.userId;
        const tickerId =
          typeof keyOrUserId === 'string' ? (tickerIdOrUpdates as string) : keyOrUserId.tickerId;
        throw new HoldingNotFoundError(userId, tickerId);
      }
      if (error instanceof InvalidEntityDataError) {
        throw new InvalidHoldingDataError(
          error.message.replace('エンティティデータが無効です: ', '')
        );
      }
      if (error instanceof DatabaseError) {
        const originalError = error.cause || error;
        const message =
          originalError instanceof Error ? originalError.message : String(originalError);
        throw new Error(`データベースエラーが発生しました: ${message}`);
      }
      if (error instanceof Error && error.message.startsWith('データベースエラーが発生しました:')) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`データベースエラーが発生しました: ${message}`);
    }
  }

  /**
   * 保有株式を削除（基底クラスのシグネチャ）
   */
  async delete(key: { userId: string; tickerId: string }): Promise<void>;
  /**
   * 保有株式を削除（互換性のある2パラメータ版）
   */
  async delete(userId: string, tickerId: string): Promise<void>;
  /**
   * 保有株式を削除の実装
   */
  async delete(
    keyOrUserId: { userId: string; tickerId: string } | string,
    tickerId?: string
  ): Promise<void> {
    try {
      let userId: string;
      let tickerIdValue: string;

      if (typeof keyOrUserId === 'string') {
        // 2-parameter version: (userId, tickerId)
        userId = keyOrUserId;
        tickerIdValue = tickerId as string;
      } else {
        // 1-parameter version: (key)
        userId = keyOrUserId.userId;
        tickerIdValue = keyOrUserId.tickerId;
      }

      // 存在確認
      const existing = await this.getById(userId, tickerIdValue);
      if (!existing) {
        throw new HoldingNotFoundError(userId, tickerIdValue);
      }

      await super.delete({ userId, tickerId: tickerIdValue });
    } catch (error) {
      if (error instanceof HoldingNotFoundError) {
        throw error;
      }
      if (error instanceof EntityNotFoundError) {
        const userId = typeof keyOrUserId === 'string' ? keyOrUserId : keyOrUserId.userId;
        const tickerIdValue =
          typeof keyOrUserId === 'string' ? (tickerId as string) : keyOrUserId.tickerId;
        throw new HoldingNotFoundError(userId, tickerIdValue);
      }
      if (error instanceof DatabaseError) {
        const originalError = error.cause || error;
        const message =
          originalError instanceof Error ? originalError.message : String(originalError);
        throw new Error(`データベースエラーが発生しました: ${message}`);
      }
      if (error instanceof Error && error.message.startsWith('データベースエラーが発生しました:')) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`データベースエラーが発生しました: ${message}`);
    }
  }
}
