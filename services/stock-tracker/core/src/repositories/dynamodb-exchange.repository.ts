/**
 * Stock Tracker Core - DynamoDB Exchange Repository
 *
 * DynamoDBを使用したExchangeRepositoryの実装
 */

import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  EntityNotFoundError,
  EntityAlreadyExistsError,
  DatabaseError,
  type DynamoDBItem,
} from '@nagiyu/aws';
import type { ExchangeRepository } from './exchange.repository.interface.js';
import type {
  ExchangeEntity,
  CreateExchangeInput,
  UpdateExchangeInput,
} from '../entities/exchange.entity.js';
import { ExchangeMapper } from '../mappers/exchange.mapper.js';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  NO_UPDATES_SPECIFIED: '更新するフィールドが指定されていません',
} as const;

/**
 * DynamoDB Exchange Repository
 *
 * DynamoDBを使用した取引所リポジトリの実装
 */
export class DynamoDBExchangeRepository implements ExchangeRepository {
  private readonly mapper: ExchangeMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.mapper = new ExchangeMapper();
  }

  /**
   * 取引所IDで単一の取引所を取得
   */
  public async getById(exchangeId: string): Promise<ExchangeEntity | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ exchangeId });

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
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 全取引所を取得
   */
  public async getAll(): Promise<ExchangeEntity[]> {
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

      return result.Items.map((item) => this.mapper.toEntity(item as unknown as DynamoDBItem));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 新しい取引所を作成
   */
  public async create(input: CreateExchangeInput): Promise<ExchangeEntity> {
    try {
      const now = Date.now();
      const entity: ExchangeEntity = {
        ...input,
        CreatedAt: now,
        UpdatedAt: now,
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
        throw new EntityAlreadyExistsError('Exchange', input.ExchangeID);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 取引所を更新
   */
  public async update(exchangeId: string, updates: UpdateExchangeInput): Promise<ExchangeEntity> {
    try {
      // 更新するフィールドがない場合はエラー
      if (Object.keys(updates).length === 0) {
        throw new DatabaseError(ERROR_MESSAGES.NO_UPDATES_SPECIFIED);
      }

      const { pk, sk } = this.mapper.buildKeys({ exchangeId });
      const now = Date.now();

      // 更新式を動的に構築
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, unknown> = {};

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

      // UpdatedAt を常に更新
      updateExpressions.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'UpdatedAt';
      expressionAttributeValues[':updatedAt'] = now;

      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ConditionExpression: 'attribute_exists(PK)',
          ReturnValues: 'ALL_NEW',
        })
      );

      if (!result.Attributes) {
        throw new EntityNotFoundError('Exchange', exchangeId);
      }

      return this.mapper.toEntity(result.Attributes as unknown as DynamoDBItem);
    } catch (error) {
      // 条件チェック失敗（アイテムが存在しない）
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new EntityNotFoundError('Exchange', exchangeId);
      }
      // EntityNotFoundError はそのまま投げる
      if (error instanceof EntityNotFoundError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 取引所を削除
   */
  public async delete(exchangeId: string): Promise<void> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ exchangeId });

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
        throw new EntityNotFoundError('Exchange', exchangeId);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
