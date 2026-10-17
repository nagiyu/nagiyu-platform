/**
 * NiconicoMylistAssistant Core - DynamoDB UserSetting Repository
 *
 * DynamoDBを使用したUserSettingRepositoryの実装
 */

import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DynamoDBEntityStore,
  toDatabaseError,
  encodeCursor,
  decodeCursor,
  type EntityStore,
  type PaginationOptions,
  type PaginatedResult,
} from '@nagiyu/aws';
import type { UserSettingRepository } from './user-setting.repository.interface.js';
import type {
  UserSettingEntity,
  UserSettingKey,
  CreateUserSettingInput,
  UpdateUserSettingInput,
} from '../entities/user-setting.entity.js';
import { UserSettingMapper } from '../mappers/user-setting.mapper.js';

/**
 * DynamoDB UserSetting Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、ユーザー単位の Query だけを自前で持つ
 */
export class DynamoDBUserSettingRepository implements UserSettingRepository {
  private readonly mapper = new UserSettingMapper();
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly entityStore: EntityStore<UserSettingEntity, UserSettingKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper);
  }

  /**
   * ユーザーIDと動画IDで単一の設定を取得
   */
  public async getById(userId: string, videoId: string): Promise<UserSettingEntity | null> {
    return this.entityStore.get({ userId, videoId });
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
      const exclusiveStartKey = decodeCursor(options?.cursor);

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

      const items = (result.Items || []).map((item) => this.mapper.toEntity(item));

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
    const now = Date.now();
    // updatedAt は store が書き込み時に現在時刻で上書きする。Entity 型上は必須のため値だけ渡す。
    return this.entityStore.create({ ...input, createdAt: now, updatedAt: now });
  }

  /**
   * ユーザー設定を作成または更新（upsert）
   */
  public async upsert(input: CreateUserSettingInput): Promise<UserSettingEntity> {
    const now = Date.now();

    // 既存レコードの createdAt を保つため先に読む
    const existing = await this.getById(input.userId, input.videoId);

    return this.entityStore.put({
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  /**
   * ユーザー設定を更新
   */
  public async update(
    userId: string,
    videoId: string,
    updates: UpdateUserSettingInput
  ): Promise<UserSettingEntity> {
    return this.entityStore.update({ userId, videoId }, updates);
  }

  /**
   * ユーザー設定を削除
   */
  public async delete(userId: string, videoId: string): Promise<void> {
    await this.entityStore.delete({ userId, videoId });
  }
}
