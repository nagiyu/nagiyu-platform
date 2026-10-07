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
  mapConditionalCheckFailed,
  toDatabaseError,
  buildUpdateExpression,
  encodeCursor,
  decodeCursor,
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
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.mapper = new HoldingMapper();
  }

  /**
   * ユーザーIDとティッカーIDで単一の保有株式を取得
   */
  public async getById(userId: string, tickerId: string): Promise<HoldingEntity | null> {
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
      throw toDatabaseError(error);
    }
  }

  /**
   * ユーザーの保有株式一覧を取得（GSI1使用）
   */
  public async getByUserId(
    userId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<HoldingEntity>> {
    try {
      const limit = options?.limit || 50;
      const exclusiveStartKey = decodeCursor(options?.cursor);

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
      const nextCursor = encodeCursor(result.LastEvaluatedKey);

      return {
        items,
        nextCursor,
        count: result.Count,
      };
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  /**
   * 新しい保有株式を作成
   */
  public async create(input: CreateHoldingInput): Promise<HoldingEntity> {
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
      mapConditionalCheckFailed(error, {
        onExists: () => {
          throw new EntityAlreadyExistsError('Holding', `${input.UserID}#${input.TickerID}`);
        },
      });
      throw toDatabaseError(error);
    }
  }

  /**
   * 保有株式を更新
   */
  public async update(
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
      const fields = {
        Quantity: updates.Quantity,
        AveragePrice: updates.AveragePrice,
        Currency: updates.Currency,
      };
      const updateParts = buildUpdateExpression(fields, {
        timestamp: { attributeName: 'UpdatedAt', value: Date.now() },
        updateTimestampWhenEmpty: true,
      });
      if (!updateParts) {
        throw new DatabaseError(ERROR_MESSAGES.NO_UPDATES_SPECIFIED);
      }

      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          ...updateParts,
          ConditionExpression: 'attribute_exists(PK)',
          ReturnValues: 'ALL_NEW',
        })
      );

      if (!result.Attributes) {
        throw new EntityNotFoundError('Holding', `${userId}#${tickerId}`);
      }

      return this.mapper.toEntity(result.Attributes as unknown as DynamoDBItem);
    } catch (error) {
      mapConditionalCheckFailed(error, {
        onMissing: () => {
          throw new EntityNotFoundError('Holding', `${userId}#${tickerId}`);
        },
      });
      throw toDatabaseError(error);
    }
  }

  /**
   * 保有株式を削除
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
      mapConditionalCheckFailed(error, {
        onMissing: () => {
          throw new EntityNotFoundError('Holding', `${userId}#${tickerId}`);
        },
      });
      throw toDatabaseError(error);
    }
  }
}
