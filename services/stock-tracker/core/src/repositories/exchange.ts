/**
 * Stock Tracker Core - Exchange Repository
 *
 * 取引所データの CRUD 操作を提供
 */

import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { Exchange, DynamoDBItem } from '../types.js';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  EXCHANGE_NOT_FOUND: '取引所が見つかりません',
  INVALID_EXCHANGE_DATA: '取引所データが無効です',
  EXCHANGE_ALREADY_EXISTS: '取引所は既に存在します',
  DATABASE_ERROR: 'データベースエラーが発生しました',
} as const;

// カスタムエラークラス
export class ExchangeNotFoundError extends Error {
  constructor(exchangeId: string) {
    super(`${ERROR_MESSAGES.EXCHANGE_NOT_FOUND}: ${exchangeId}`);
    this.name = 'ExchangeNotFoundError';
  }
}

export class InvalidExchangeDataError extends Error {
  constructor(message: string) {
    super(`${ERROR_MESSAGES.INVALID_EXCHANGE_DATA}: ${message}`);
    this.name = 'InvalidExchangeDataError';
  }
}

export class ExchangeAlreadyExistsError extends Error {
  constructor(exchangeId: string) {
    super(`${ERROR_MESSAGES.EXCHANGE_ALREADY_EXISTS}: ${exchangeId}`);
    this.name = 'ExchangeAlreadyExistsError';
  }
}

/**
 * Exchange リポジトリ
 *
 * DynamoDB Single Table Design に基づく取引所データの CRUD 操作
 */
export class ExchangeRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  /**
   * 全取引所を取得
   *
   * @returns 取引所の配列
   */
  async getAll(): Promise<Exchange[]> {
    try {
      const result = await this.docClient.send(
        new ScanCommand({
          TableName: this.tableName,
          FilterExpression: '#type = :type',
          ExpressionAttributeNames: {
            '#type': 'Type',
          },
          ExpressionAttributeValues: {
            ':type': 'Exchange',
          },
        })
      );

      if (!result.Items || result.Items.length === 0) {
        return [];
      }

      return result.Items.map((item) => this.mapDynamoDBItemToExchange(item));
    } catch (error) {
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 取引所IDで単一の取引所を取得
   *
   * @param exchangeId - 取引所ID
   * @returns 取引所（存在しない場合はnull）
   */
  async getById(exchangeId: string): Promise<Exchange | null> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            PK: `EXCHANGE#${exchangeId}`,
            SK: 'METADATA',
          },
        })
      );

      if (!result.Item) {
        return null;
      }

      return this.mapDynamoDBItemToExchange(result.Item);
    } catch (error) {
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 新しい取引所を作成
   *
   * @param exchange - 取引所データ（ExchangeID, Name, Key, Timezone, Start, End）
   * @returns 作成された取引所（CreatedAt, UpdatedAtを含む）
   */
  async create(exchange: Omit<Exchange, 'CreatedAt' | 'UpdatedAt'>): Promise<Exchange> {
    try {
      const now = Date.now();
      const newExchange: Exchange = {
        ...exchange,
        CreatedAt: now,
        UpdatedAt: now,
      };

      const item: DynamoDBItem & Exchange = {
        PK: `EXCHANGE#${newExchange.ExchangeID}`,
        SK: 'METADATA',
        Type: 'Exchange',
        ...newExchange,
      };

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      return newExchange;
    } catch (error) {
      // ConditionalCheckFailedException を特定してカスタムエラーにマップ
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new ExchangeAlreadyExistsError(exchange.ExchangeID);
      }
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 取引所を更新
   *
   * @param exchangeId - 取引所ID
   * @param updates - 更新するフィールド（Name, Timezone, Start, End）
   * @returns 更新された取引所
   * @throws ExchangeNotFoundError 取引所が存在しない場合
   */
  async update(
    exchangeId: string,
    updates: Partial<Pick<Exchange, 'Name' | 'Timezone' | 'Start' | 'End'>>
  ): Promise<Exchange> {
    try {
      // 存在確認
      const existing = await this.getById(exchangeId);
      if (!existing) {
        throw new ExchangeNotFoundError(exchangeId);
      }

      // 更新可能なフィールドのみ抽出
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, string | number> = {};

      if (updates.Name !== undefined) {
        updateExpressions.push('#name = :name');
        expressionAttributeNames['#name'] = 'Name';
        expressionAttributeValues[':name'] = updates.Name;
      }

      if (updates.Timezone !== undefined) {
        updateExpressions.push('#timezone = :timezone');
        expressionAttributeNames['#timezone'] = 'Timezone';
        expressionAttributeValues[':timezone'] = updates.Timezone;
      }

      if (updates.Start !== undefined) {
        updateExpressions.push('#start = :start');
        expressionAttributeNames['#start'] = 'Start';
        expressionAttributeValues[':start'] = updates.Start;
      }

      if (updates.End !== undefined) {
        updateExpressions.push('#end = :end');
        expressionAttributeNames['#end'] = 'End';
        expressionAttributeValues[':end'] = updates.End;
      }

      // UpdatedAt を自動更新
      const now = Date.now();
      updateExpressions.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'UpdatedAt';
      expressionAttributeValues[':updatedAt'] = now;

      if (updateExpressions.length === 1) {
        // UpdatedAt のみの更新（他のフィールドが指定されていない）
        throw new InvalidExchangeDataError('更新するフィールドが指定されていません');
      }

      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            PK: `EXCHANGE#${exchangeId}`,
            SK: 'METADATA',
          },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ConditionExpression: 'attribute_exists(PK)',
        })
      );

      // 更新後のデータを取得して返す
      const updated = await this.getById(exchangeId);
      if (!updated) {
        throw new ExchangeNotFoundError(exchangeId);
      }

      return updated;
    } catch (error) {
      if (error instanceof ExchangeNotFoundError || error instanceof InvalidExchangeDataError) {
        throw error;
      }
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 取引所を削除
   *
   * @param exchangeId - 取引所ID
   * @throws ExchangeNotFoundError 取引所が存在しない場合
   */
  async delete(exchangeId: string): Promise<void> {
    try {
      // 存在確認
      const existing = await this.getById(exchangeId);
      if (!existing) {
        throw new ExchangeNotFoundError(exchangeId);
      }

      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: {
            PK: `EXCHANGE#${exchangeId}`,
            SK: 'METADATA',
          },
          ConditionExpression: 'attribute_exists(PK)',
        })
      );
    } catch (error) {
      if (error instanceof ExchangeNotFoundError) {
        throw error;
      }
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * DynamoDB Item を Exchange にマッピング
   *
   * @param item - DynamoDB Item
   * @returns Exchange
   */
  private mapDynamoDBItemToExchange(item: Record<string, unknown>): Exchange {
    // フィールドのバリデーション
    const exchangeId = item.ExchangeID;
    if (typeof exchangeId !== 'string' || exchangeId.length === 0) {
      throw new InvalidExchangeDataError('フィールド "ExchangeID" が不正です');
    }

    const name = item.Name;
    if (typeof name !== 'string' || name.length === 0) {
      throw new InvalidExchangeDataError('フィールド "Name" が不正です');
    }

    const key = item.Key;
    if (typeof key !== 'string' || key.length === 0) {
      throw new InvalidExchangeDataError('フィールド "Key" が不正です');
    }

    const timezone = item.Timezone;
    if (typeof timezone !== 'string' || timezone.length === 0) {
      throw new InvalidExchangeDataError('フィールド "Timezone" が不正です');
    }

    const start = item.Start;
    if (typeof start !== 'string' || start.length === 0) {
      throw new InvalidExchangeDataError('フィールド "Start" が不正です');
    }

    const end = item.End;
    if (typeof end !== 'string' || end.length === 0) {
      throw new InvalidExchangeDataError('フィールド "End" が不正です');
    }

    const createdAt = item.CreatedAt;
    if (typeof createdAt !== 'number') {
      throw new InvalidExchangeDataError('フィールド "CreatedAt" が不正です');
    }

    const updatedAt = item.UpdatedAt;
    if (typeof updatedAt !== 'number') {
      throw new InvalidExchangeDataError('フィールド "UpdatedAt" が不正です');
    }

    const exchange: Exchange = {
      ExchangeID: exchangeId,
      Name: name,
      Key: key,
      Timezone: timezone,
      Start: start,
      End: end,
      CreatedAt: createdAt,
      UpdatedAt: updatedAt,
    };
    return exchange;
  }
}
