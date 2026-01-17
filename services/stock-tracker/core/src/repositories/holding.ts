/**
 * Stock Tracker Core - Holding Repository
 *
 * 保有株式データの CRUD 操作を提供
 */

import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { Holding, DynamoDBItem } from '../types.js';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  HOLDING_NOT_FOUND: '保有株式が見つかりません',
  INVALID_HOLDING_DATA: '保有株式データが無効です',
  HOLDING_ALREADY_EXISTS: '保有株式は既に存在します',
  DATABASE_ERROR: 'データベースエラーが発生しました',
} as const;

// カスタムエラークラス
export class HoldingNotFoundError extends Error {
  constructor(userId: string, tickerId: string) {
    super(`${ERROR_MESSAGES.HOLDING_NOT_FOUND}: UserID=${userId}, TickerID=${tickerId}`);
    this.name = 'HoldingNotFoundError';
  }
}

export class InvalidHoldingDataError extends Error {
  constructor(message: string) {
    super(`${ERROR_MESSAGES.INVALID_HOLDING_DATA}: ${message}`);
    this.name = 'InvalidHoldingDataError';
  }
}

export class HoldingAlreadyExistsError extends Error {
  constructor(userId: string, tickerId: string) {
    super(`${ERROR_MESSAGES.HOLDING_ALREADY_EXISTS}: UserID=${userId}, TickerID=${tickerId}`);
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
export class HoldingRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
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
          TableName: this.tableName,
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

      const items = result.Items.map((item) => this.mapDynamoDBItemToHolding(item));

      return {
        items,
        lastKey: result.LastEvaluatedKey as { PK: string; SK: string } | undefined,
      };
    } catch (error) {
      if (error instanceof InvalidHoldingDataError) {
        throw error;
      }
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * ユーザーIDとティッカーIDで単一の保有株式を取得
   *
   * @param userId - ユーザーID
   * @param tickerId - ティッカーID
   * @returns 保有株式（存在しない場合はnull）
   */
  async getById(userId: string, tickerId: string): Promise<Holding | null> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            PK: `USER#${userId}`,
            SK: `HOLDING#${tickerId}`,
          },
        })
      );

      if (!result.Item) {
        return null;
      }

      return this.mapDynamoDBItemToHolding(result.Item);
    } catch (error) {
      if (error instanceof InvalidHoldingDataError) {
        throw error;
      }
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
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
      const now = Date.now();
      const newHolding: Holding = {
        ...holding,
        CreatedAt: now,
        UpdatedAt: now,
      };

      const item: DynamoDBItem & Holding = {
        PK: `USER#${newHolding.UserID}`,
        SK: `HOLDING#${newHolding.TickerID}`,
        Type: 'Holding',
        GSI1PK: newHolding.UserID,
        GSI1SK: `Holding#${newHolding.TickerID}`,
        ...newHolding,
      };

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      return newHolding;
    } catch (error) {
      // ConditionalCheckFailedException を特定してカスタムエラーにマップ
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new HoldingAlreadyExistsError(holding.UserID, holding.TickerID);
      }
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 保有株式を更新
   *
   * @param userId - ユーザーID
   * @param tickerId - ティッカーID
   * @param updates - 更新するフィールド（Quantity, AveragePrice, Currency）
   * @returns 更新された保有株式
   * @throws HoldingNotFoundError 保有株式が存在しない場合
   */
  async update(
    userId: string,
    tickerId: string,
    updates: Partial<Pick<Holding, 'Quantity' | 'AveragePrice' | 'Currency'>>
  ): Promise<Holding> {
    try {
      // 存在確認
      const existing = await this.getById(userId, tickerId);
      if (!existing) {
        throw new HoldingNotFoundError(userId, tickerId);
      }

      // 更新可能なフィールドのみ抽出
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, string | number> = {};

      if (updates.Quantity !== undefined) {
        updateExpressions.push('#quantity = :quantity');
        expressionAttributeNames['#quantity'] = 'Quantity';
        expressionAttributeValues[':quantity'] = updates.Quantity;
      }

      if (updates.AveragePrice !== undefined) {
        updateExpressions.push('#averagePrice = :averagePrice');
        expressionAttributeNames['#averagePrice'] = 'AveragePrice';
        expressionAttributeValues[':averagePrice'] = updates.AveragePrice;
      }

      if (updates.Currency !== undefined) {
        updateExpressions.push('#currency = :currency');
        expressionAttributeNames['#currency'] = 'Currency';
        expressionAttributeValues[':currency'] = updates.Currency;
      }

      // UpdatedAt を自動更新
      const now = Date.now();
      updateExpressions.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'UpdatedAt';
      expressionAttributeValues[':updatedAt'] = now;

      if (updateExpressions.length === 1) {
        // UpdatedAt のみの更新（他のフィールドが指定されていない）
        throw new InvalidHoldingDataError('更新するフィールドが指定されていません');
      }

      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            PK: `USER#${userId}`,
            SK: `HOLDING#${tickerId}`,
          },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ConditionExpression: 'attribute_exists(PK)',
        })
      );

      // 更新後のデータを取得して返す
      const updated = await this.getById(userId, tickerId);
      if (!updated) {
        throw new HoldingNotFoundError(userId, tickerId);
      }

      return updated;
    } catch (error) {
      if (error instanceof HoldingNotFoundError || error instanceof InvalidHoldingDataError) {
        throw error;
      }
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 保有株式を削除
   *
   * @param userId - ユーザーID
   * @param tickerId - ティッカーID
   * @throws HoldingNotFoundError 保有株式が存在しない場合
   */
  async delete(userId: string, tickerId: string): Promise<void> {
    try {
      // 存在確認
      const existing = await this.getById(userId, tickerId);
      if (!existing) {
        throw new HoldingNotFoundError(userId, tickerId);
      }

      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: {
            PK: `USER#${userId}`,
            SK: `HOLDING#${tickerId}`,
          },
          ConditionExpression: 'attribute_exists(PK)',
        })
      );
    } catch (error) {
      if (error instanceof HoldingNotFoundError) {
        throw error;
      }
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * DynamoDB Item を Holding にマッピング
   *
   * @param item - DynamoDB Item
   * @returns Holding
   */
  private mapDynamoDBItemToHolding(item: Record<string, unknown>): Holding {
    // フィールドのバリデーション
    const userId = item.UserID;
    if (typeof userId !== 'string' || userId.length === 0) {
      throw new InvalidHoldingDataError('フィールド "UserID" が不正です');
    }

    const tickerId = item.TickerID;
    if (typeof tickerId !== 'string' || tickerId.length === 0) {
      throw new InvalidHoldingDataError('フィールド "TickerID" が不正です');
    }

    const exchangeId = item.ExchangeID;
    if (typeof exchangeId !== 'string' || exchangeId.length === 0) {
      throw new InvalidHoldingDataError('フィールド "ExchangeID" が不正です');
    }

    const quantity = item.Quantity;
    if (typeof quantity !== 'number') {
      throw new InvalidHoldingDataError('フィールド "Quantity" が不正です');
    }

    const averagePrice = item.AveragePrice;
    if (typeof averagePrice !== 'number') {
      throw new InvalidHoldingDataError('フィールド "AveragePrice" が不正です');
    }

    const currency = item.Currency;
    if (typeof currency !== 'string' || currency.length === 0) {
      throw new InvalidHoldingDataError('フィールド "Currency" が不正です');
    }

    const createdAt = item.CreatedAt;
    if (typeof createdAt !== 'number') {
      throw new InvalidHoldingDataError('フィールド "CreatedAt" が不正です');
    }

    const updatedAt = item.UpdatedAt;
    if (typeof updatedAt !== 'number') {
      throw new InvalidHoldingDataError('フィールド "UpdatedAt" が不正です');
    }

    const holding: Holding = {
      UserID: userId,
      TickerID: tickerId,
      ExchangeID: exchangeId,
      Quantity: quantity,
      AveragePrice: averagePrice,
      Currency: currency,
      CreatedAt: createdAt,
      UpdatedAt: updatedAt,
    };
    return holding;
  }
}
