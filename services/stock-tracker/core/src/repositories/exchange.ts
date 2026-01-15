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
  TABLE_NAME_NOT_SET: 'テーブル名が設定されていません',
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

/**
 * Exchange リポジトリ
 *
 * DynamoDB Single Table Design に基づく取引所データの CRUD 操作
 */
export class ExchangeRepository {
  constructor(
    private readonly dynamoDb: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {
    if (!tableName) {
      throw new Error(ERROR_MESSAGES.TABLE_NAME_NOT_SET);
    }
  }

  /**
   * 全取引所を取得
   *
   * @returns 取引所の配列
   */
  async getAll(): Promise<Exchange[]> {
    const result = await this.dynamoDb.send(
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

    return (result.Items || []).map((item: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { PK, SK, Type, GSI1PK, GSI1SK, GSI2PK, GSI2SK, GSI3PK, GSI3SK, ...exchange } = item as DynamoDBItem & Exchange;
      return exchange as Exchange;
    });
  }

  /**
   * 取引所IDで単一の取引所を取得
   *
   * @param exchangeId - 取引所ID
   * @returns 取引所（存在しない場合はnull）
   */
  async getById(exchangeId: string): Promise<Exchange | null> {
    const result = await this.dynamoDb.send(
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { PK, SK, Type, GSI1PK, GSI1SK, GSI2PK, GSI2SK, GSI3PK, GSI3SK, ...exchange } =
      result.Item as DynamoDBItem & Exchange;
    return exchange as Exchange;
  }

  /**
   * 新しい取引所を作成
   *
   * @param exchange - 取引所データ（ExchangeID, Name, Key, Timezone, Start, End）
   * @returns 作成された取引所（CreatedAt, UpdatedAtを含む）
   */
  async create(exchange: Omit<Exchange, 'CreatedAt' | 'UpdatedAt'>): Promise<Exchange> {
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

    await this.dynamoDb.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(PK)',
      })
    );

    return newExchange;
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

    await this.dynamoDb.send(
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
  }

  /**
   * 取引所を削除
   *
   * @param exchangeId - 取引所ID
   * @throws ExchangeNotFoundError 取引所が存在しない場合
   */
  async delete(exchangeId: string): Promise<void> {
    // 存在確認
    const existing = await this.getById(exchangeId);
    if (!existing) {
      throw new ExchangeNotFoundError(exchangeId);
    }

    await this.dynamoDb.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: `EXCHANGE#${exchangeId}`,
          SK: 'METADATA',
        },
        ConditionExpression: 'attribute_exists(PK)',
      })
    );
  }
}
