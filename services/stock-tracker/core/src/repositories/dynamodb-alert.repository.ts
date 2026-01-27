/**
 * Stock Tracker Core - DynamoDB Alert Repository
 *
 * DynamoDBを使用したAlertRepositoryの実装
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
import type { AlertRepository } from './alert.repository.interface.js';
import type { AlertEntity, CreateAlertInput, UpdateAlertInput } from '../entities/alert.entity.js';
import { AlertMapper } from '../mappers/alert.mapper.js';
import { randomUUID } from 'crypto';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  NO_UPDATES_SPECIFIED: '更新するフィールドが指定されていません',
} as const;

/**
 * DynamoDB Alert Repository
 *
 * DynamoDBを使用したアラートリポジトリの実装
 */
export class DynamoDBAlertRepository implements AlertRepository {
  private readonly mapper: AlertMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.mapper = new AlertMapper();
  }

  /**
   * ユーザーIDとアラートIDで単一のアラートを取得
   */
  public async getById(userId: string, alertId: string): Promise<AlertEntity | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ userId, alertId });

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
   * ユーザーのアラート一覧を取得（GSI1使用）
   */
  public async getByUserId(
    userId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<AlertEntity>> {
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
            ':prefix': 'Alert#',
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
   * 頻度ごとのアラート一覧を取得（GSI2使用、バッチ処理用）
   */
  public async getByFrequency(
    frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL',
    options?: PaginationOptions
  ): Promise<PaginatedResult<AlertEntity>> {
    try {
      const limit = options?.limit || 50;
      const exclusiveStartKey = options?.cursor
        ? JSON.parse(Buffer.from(options.cursor, 'base64').toString('utf-8'))
        : undefined;

      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'AlertIndex',
          KeyConditionExpression: '#gsi2pk = :pk',
          ExpressionAttributeNames: {
            '#gsi2pk': 'GSI2PK',
          },
          ExpressionAttributeValues: {
            ':pk': `ALERT#${frequency}`,
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
   * 新しいアラートを作成
   */
  public async create(input: CreateAlertInput): Promise<AlertEntity> {
    try {
      const now = Date.now();
      const alertId = randomUUID();
      const entity: AlertEntity = {
        ...input,
        AlertID: alertId,
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
        throw new EntityAlreadyExistsError('Alert', `${input.UserID}#(generated)`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * アラートを更新
   */
  public async update(
    userId: string,
    alertId: string,
    updates: UpdateAlertInput
  ): Promise<AlertEntity> {
    try {
      // 更新するフィールドがない場合はエラー
      if (Object.keys(updates).length === 0) {
        throw new DatabaseError(ERROR_MESSAGES.NO_UPDATES_SPECIFIED);
      }

      const { pk, sk } = this.mapper.buildKeys({ userId, alertId });
      const now = Date.now();

      // 更新式を動的に構築
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, unknown> = {};

      if (updates.TickerID !== undefined) {
        updateExpressions.push('#tickerId = :tickerId');
        expressionAttributeNames['#tickerId'] = 'TickerID';
        expressionAttributeValues[':tickerId'] = updates.TickerID;
      }
      if (updates.ExchangeID !== undefined) {
        updateExpressions.push('#exchangeId = :exchangeId');
        expressionAttributeNames['#exchangeId'] = 'ExchangeID';
        expressionAttributeValues[':exchangeId'] = updates.ExchangeID;
      }
      if (updates.Mode !== undefined) {
        updateExpressions.push('#mode = :mode');
        expressionAttributeNames['#mode'] = 'Mode';
        expressionAttributeValues[':mode'] = updates.Mode;
      }
      if (updates.Frequency !== undefined) {
        updateExpressions.push('#frequency = :frequency');
        expressionAttributeNames['#frequency'] = 'Frequency';
        expressionAttributeValues[':frequency'] = updates.Frequency;
        // Frequency が更新される場合、GSI2PK も更新する必要がある
        updateExpressions.push('#gsi2pk = :gsi2pk');
        expressionAttributeNames['#gsi2pk'] = 'GSI2PK';
        expressionAttributeValues[':gsi2pk'] = `ALERT#${updates.Frequency}`;
      }
      if (updates.Enabled !== undefined) {
        updateExpressions.push('#enabled = :enabled');
        expressionAttributeNames['#enabled'] = 'Enabled';
        expressionAttributeValues[':enabled'] = updates.Enabled;
      }
      if (updates.ConditionList !== undefined) {
        updateExpressions.push('#conditionList = :conditionList');
        expressionAttributeNames['#conditionList'] = 'ConditionList';
        expressionAttributeValues[':conditionList'] = updates.ConditionList;
      }
      if (updates.SubscriptionEndpoint !== undefined) {
        updateExpressions.push('#subscriptionEndpoint = :subscriptionEndpoint');
        expressionAttributeNames['#subscriptionEndpoint'] = 'SubscriptionEndpoint';
        expressionAttributeValues[':subscriptionEndpoint'] = updates.SubscriptionEndpoint;
      }
      if (updates.SubscriptionKeysP256dh !== undefined) {
        updateExpressions.push('#subscriptionKeysP256dh = :subscriptionKeysP256dh');
        expressionAttributeNames['#subscriptionKeysP256dh'] = 'SubscriptionKeysP256dh';
        expressionAttributeValues[':subscriptionKeysP256dh'] = updates.SubscriptionKeysP256dh;
      }
      if (updates.SubscriptionKeysAuth !== undefined) {
        updateExpressions.push('#subscriptionKeysAuth = :subscriptionKeysAuth');
        expressionAttributeNames['#subscriptionKeysAuth'] = 'SubscriptionKeysAuth';
        expressionAttributeValues[':subscriptionKeysAuth'] = updates.SubscriptionKeysAuth;
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
        throw new EntityNotFoundError('Alert', `${userId}#${alertId}`);
      }

      return this.mapper.toEntity(result.Attributes as unknown as DynamoDBItem);
    } catch (error) {
      // 条件チェック失敗（アイテムが存在しない）
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new EntityNotFoundError('Alert', `${userId}#${alertId}`);
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
   * アラートを削除
   */
  public async delete(userId: string, alertId: string): Promise<void> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ userId, alertId });

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
        throw new EntityNotFoundError('Alert', `${userId}#${alertId}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
