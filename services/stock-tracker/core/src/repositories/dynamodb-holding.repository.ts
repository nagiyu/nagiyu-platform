/**
 * Stock Tracker Core - DynamoDB Holding Repository
 *
 * DynamoDBを使用したHoldingRepositoryの実装
 */

import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  EntityNotFoundError,
  EntityAlreadyExistsError,
  DatabaseError,
  type PaginationOptions,
  type PaginatedResult,
  type DynamoDBItem,
} from '@nagiyu/aws';
import type { HoldingRepository } from './holding.repository.interface.js';
import type {
  HoldingEntity,
  CreateHoldingInput,
  UpdateHoldingInput,
} from '../entities/holding.entity.js';
import { HoldingMapper } from '../mappers/holding.mapper.js';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  NO_UPDATES_SPECIFIED: '更新するフィールドが指定されていません',
} as const;

/**
 * DynamoDB Holding Repository
 *
 * DynamoDBを使用した保有株式リポジトリの実装
 */
export class DynamoDBHoldingRepository implements HoldingRepository {
  private readonly mapper: HoldingMapper;

  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {
    this.mapper = new HoldingMapper();
  }

  /**
   * ユーザーIDとティッカーIDで単一の保有株式を取得
   */
  async getById(userId: string, tickerId: string): Promise<HoldingEntity | null> {
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
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * ユーザーの保有株式一覧を取得（GSI1使用）
   */
  async getByUserId(
    userId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<HoldingEntity>> {
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
            ':prefix': 'Holding#',
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
        count: result.Count,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 新しい保有株式を作成
   */
  async create(input: CreateHoldingInput): Promise<HoldingEntity> {
    try {
      const now = Date.now();
      const entity: HoldingEntity = {
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
        throw new EntityAlreadyExistsError('Holding', `${input.UserID}#${input.TickerID}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 保有株式を更新
   */
  async update(
    userId: string,
    tickerId: string,
    updates: UpdateHoldingInput
  ): Promise<HoldingEntity> {
    try {
      // 更新するフィールドがない場合はエラー
      if (Object.keys(updates).length === 0) {
        throw new DatabaseError(ERROR_MESSAGES.NO_UPDATES_SPECIFIED);
      }

      const { pk, sk } = this.mapper.buildKeys({ userId, tickerId });
      const now = Date.now();

      // 更新式を動的に構築
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, unknown> = {};

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
        throw new EntityNotFoundError('Holding', `${userId}#${tickerId}`);
      }

      return this.mapper.toEntity(result.Attributes as unknown as DynamoDBItem);
    } catch (error) {
      // 条件チェック失敗（アイテムが存在しない）
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new EntityNotFoundError('Holding', `${userId}#${tickerId}`);
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
   * 保有株式を削除
   */
  async delete(userId: string, tickerId: string): Promise<void> {
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
        throw new EntityNotFoundError('Holding', `${userId}#${tickerId}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
