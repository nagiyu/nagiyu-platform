/**
 * NiconicoMylistAssistant Core - DynamoDB UserSetting Repository
 *
 * DynamoDBを使用したUserSettingRepositoryの実装
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
} from '@nagiyu/aws';
import type { UserSettingRepository } from './user-setting.repository.interface';
import type {
  UserSettingEntity,
  CreateUserSettingInput,
  UpdateUserSettingInput,
} from '../entities/user-setting.entity';
import { UserSettingMapper } from '../mappers/user-setting.mapper';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  NO_UPDATES_SPECIFIED: '更新するフィールドが指定されていません',
} as const;

/**
 * DynamoDB UserSetting Repository
 *
 * DynamoDBを使用したユーザー設定リポジトリの実装
 */
export class DynamoDBUserSettingRepository implements UserSettingRepository {
  private readonly mapper: UserSettingMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.mapper = new UserSettingMapper();
  }

  /**
   * ユーザーIDと動画IDで単一の設定を取得
   */
  public async getById(userId: string, videoId: string): Promise<UserSettingEntity | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ userId, videoId });

      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
        })
      );

      if (!result.Item) {
        return null;
      }

      return this.mapper.toEntity(result.Item as ReturnType<UserSettingMapper['toItem']>);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * ユーザーの全動画設定を取得
   */
  public async getByUserId(
    userId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<UserSettingEntity>> {
    try {
      const limit = options?.limit || 100;
      const exclusiveStartKey = options?.cursor
        ? JSON.parse(Buffer.from(options.cursor, 'base64').toString('utf-8'))
        : undefined;

      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': 'VIDEO#',
          },
          Limit: limit,
          ExclusiveStartKey: exclusiveStartKey,
        })
      );

      const items = (result.Items || []).map((item) =>
        this.mapper.toEntity(item as ReturnType<UserSettingMapper['toItem']>)
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
   * ユーザーの動画設定を取得（フィルタリング対応）
   */
  public async getByUserIdWithFilters(
    userId: string,
    filters: {
      isFavorite?: boolean;
      isSkip?: boolean;
    },
    options?: { limit?: number; offset?: number }
  ): Promise<{ settings: UserSettingEntity[]; total: number }> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    // DynamoDBからユーザーの全設定を取得
    // フィルタリングのため、全件取得が必要
    const allSettings: UserSettingEntity[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.getByUserId(userId, {
        limit: 100,
        cursor,
      });
      allSettings.push(...result.items);
      cursor = result.nextCursor;
    } while (cursor);

    // フィルタリング適用
    let filteredSettings = allSettings;

    if (filters.isFavorite !== undefined) {
      filteredSettings = filteredSettings.filter(
        (setting) => setting.isFavorite === filters.isFavorite
      );
    }

    if (filters.isSkip !== undefined) {
      filteredSettings = filteredSettings.filter((setting) => setting.isSkip === filters.isSkip);
    }

    // 総件数
    const total = filteredSettings.length;

    // ページネーション適用
    const paginatedSettings = filteredSettings.slice(offset, offset + limit);

    return {
      settings: paginatedSettings,
      total,
    };
  }

  /**
   * 新しいユーザー設定を作成
   */
  public async create(input: CreateUserSettingInput): Promise<UserSettingEntity> {
    const now = new Date().toISOString();
    const entity: UserSettingEntity = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    try {
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
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new EntityAlreadyExistsError('UserSetting', `userId=${input.userId}, videoId=${input.videoId}`);
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * ユーザー設定を作成または更新（upsert）
   */
  public async upsert(input: CreateUserSettingInput): Promise<UserSettingEntity> {
    const now = new Date().toISOString();

    // 既存レコードの取得（createdAt を保持するため）
    const existing = await this.getById(input.userId, input.videoId);

    const entity: UserSettingEntity = {
      ...input,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    try {
      const item = this.mapper.toItem(entity);

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
        })
      );

      return entity;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * ユーザー設定を更新
   */
  public async update(
    userId: string,
    videoId: string,
    updates: UpdateUserSettingInput
  ): Promise<UserSettingEntity> {
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, string | boolean | number> = {};

    if (updates.isFavorite !== undefined) {
      updateExpressions.push('#isFavorite = :isFavorite');
      expressionAttributeNames['#isFavorite'] = 'isFavorite';
      expressionAttributeValues[':isFavorite'] = updates.isFavorite;
    }

    if (updates.isSkip !== undefined) {
      updateExpressions.push('#isSkip = :isSkip');
      expressionAttributeNames['#isSkip'] = 'isSkip';
      expressionAttributeValues[':isSkip'] = updates.isSkip;
    }

    if (updates.memo !== undefined) {
      updateExpressions.push('#memo = :memo');
      expressionAttributeNames['#memo'] = 'memo';
      expressionAttributeValues[':memo'] = updates.memo;
    }

    if (updateExpressions.length === 0) {
      throw new Error(ERROR_MESSAGES.NO_UPDATES_SPECIFIED);
    }

    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    try {
      const { pk, sk } = this.mapper.buildKeys({ userId, videoId });

      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            PK: pk,
            SK: sk,
          },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ConditionExpression: 'attribute_exists(PK)',
          ReturnValues: 'ALL_NEW',
        })
      );

      return this.mapper.toEntity(result.Attributes as ReturnType<UserSettingMapper['toItem']>);
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new EntityNotFoundError('UserSetting', `userId=${userId}, videoId=${videoId}`);
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * ユーザー設定を削除
   */
  public async delete(userId: string, videoId: string): Promise<void> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ userId, videoId });

      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
