/**
 * NiconicoMylistAssistant Core - InMemory UserSetting Repository
 *
 * テスト用のインメモリ実装
 */

import {
  InMemorySingleTableStore,
  EntityNotFoundError,
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
 * InMemory UserSetting Repository
 *
 * テスト用のインメモリユーザー設定リポジトリの実装
 */
export class InMemoryUserSettingRepository implements UserSettingRepository {
  private readonly mapper: UserSettingMapper;
  private readonly store: InMemorySingleTableStore;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.mapper = new UserSettingMapper();
  }

  /**
   * ユーザーIDと動画IDで単一の設定を取得
   */
  public async getById(userId: string, videoId: string): Promise<UserSettingEntity | null> {
    const { pk, sk } = this.mapper.buildKeys({ userId, videoId });
    const item = this.store.get(pk, sk);

    if (!item) {
      return null;
    }

    return this.mapper.toEntity(item);
  }

  /**
   * ユーザーの全動画設定を取得
   */
  public async getByUserId(
    userId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<UserSettingEntity>> {
    const result = this.store.query(
      {
        pk: `USER#${userId}`,
        sk: {
          operator: 'begins_with',
          value: 'VIDEO#',
        },
      },
      options
    );

    const items = result.items.map((item) => this.mapper.toEntity(item));

    return {
      items,
      nextCursor: result.nextCursor,
      count: result.count,
    };
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

    // インメモリストアから全件取得してフィルタリング
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
    const entity: UserSettingEntity = {
      ...input,
      CreatedAt: now,
      UpdatedAt: now,
    };

    const item = this.mapper.toItem(entity);

    // DynamoDB と同じエラーを投げる（attributeNotExists 条件）
    // InMemorySingleTableStore が投げた EntityAlreadyExistsError をそのまま伝播
    this.store.put(item, { attributeNotExists: true });

    return entity;
  }

  /**
   * ユーザー設定を作成または更新（upsert）
   */
  public async upsert(input: CreateUserSettingInput): Promise<UserSettingEntity> {
    const now = Date.now();

    // 既存レコードの取得（CreatedAt を保持するため）
    const existing = await this.getById(input.userId, input.videoId);

    const entity: UserSettingEntity = {
      ...input,
      CreatedAt: existing?.CreatedAt || now,
      UpdatedAt: now,
    };

    const item = this.mapper.toItem(entity);

    // 条件なし保存（upsert）
    this.store.put(item);

    return entity;
  }

  /**
   * ユーザー設定を更新
   */
  public async update(
    userId: string,
    videoId: string,
    updates: UpdateUserSettingInput
  ): Promise<UserSettingEntity> {
    // 既存エンティティを取得
    const existing = await this.getById(userId, videoId);

    if (!existing) {
      throw new EntityNotFoundError('UserSetting', `userId=${userId}, videoId=${videoId}`);
    }

    // 更新されたフィールドのチェック
    const hasUpdates =
      updates.isFavorite !== undefined ||
      updates.isSkip !== undefined ||
      updates.memo !== undefined;

    if (!hasUpdates) {
      throw new Error(ERROR_MESSAGES.NO_UPDATES_SPECIFIED);
    }

    // エンティティを更新
    const updatedEntity: UserSettingEntity = {
      ...existing,
      ...(updates.isFavorite !== undefined && { isFavorite: updates.isFavorite }),
      ...(updates.isSkip !== undefined && { isSkip: updates.isSkip }),
      ...(updates.memo !== undefined && { memo: updates.memo }),
      UpdatedAt: Date.now(),
    };

    const item = this.mapper.toItem(updatedEntity);

    // 条件なし保存（既存チェックは済み）
    this.store.put(item);

    return updatedEntity;
  }

  /**
   * ユーザー設定を削除
   */
  public async delete(userId: string, videoId: string): Promise<void> {
    const { pk, sk } = this.mapper.buildKeys({ userId, videoId });
    this.store.delete(pk, sk);
  }
}
