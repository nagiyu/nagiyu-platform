/**
 * NiconicoMylistAssistant Core - UserSetting Repository Interface
 *
 * ユーザー設定データの CRUD 操作インターフェース
 */

import type {
  UserSettingEntity,
  CreateUserSettingInput,
  UpdateUserSettingInput,
  UserSettingKey,
} from '../entities/user-setting.entity';
import type { PaginationOptions, PaginatedResult } from '@nagiyu/aws';

/**
 * UserSetting Repository インターフェース
 *
 * DynamoDB実装とInMemory実装が共通で実装するインターフェース
 */
export interface UserSettingRepository {
  /**
   * ユーザーIDと動画IDで単一の設定を取得
   *
   * @param userId - ユーザーID
   * @param videoId - 動画ID
   * @returns ユーザー設定エンティティ（存在しない場合はnull）
   */
  getById(userId: string, videoId: string): Promise<UserSettingEntity | null>;

  /**
   * ユーザーの全動画設定を取得
   *
   * @param userId - ユーザーID
   * @param options - ページネーションオプション
   * @returns ページネーション結果
   */
  getByUserId(userId: string, options?: PaginationOptions): Promise<PaginatedResult<UserSettingEntity>>;

  /**
   * ユーザーの動画設定を取得（フィルタリング対応）
   *
   * @param userId - ユーザーID
   * @param filters - フィルタ条件
   * @param options - ページネーションオプション
   * @returns フィルタリングされた設定の配列
   */
  getByUserIdWithFilters(
    userId: string,
    filters: {
      isFavorite?: boolean;
      isSkip?: boolean;
    },
    options?: { limit?: number; offset?: number }
  ): Promise<{ settings: UserSettingEntity[]; total: number }>;

  /**
   * 新しいユーザー設定を作成
   *
   * @param input - ユーザー設定データ
   * @returns 作成されたユーザー設定エンティティ（createdAt, updatedAtを含む）
   * @throws {EntityAlreadyExistsError} 既に同じキーの設定が存在する場合
   */
  create(input: CreateUserSettingInput): Promise<UserSettingEntity>;

  /**
   * ユーザー設定を作成または更新（upsert）
   *
   * @param input - ユーザー設定データ
   * @returns 作成または更新されたユーザー設定エンティティ
   */
  upsert(input: CreateUserSettingInput): Promise<UserSettingEntity>;

  /**
   * ユーザー設定を更新
   *
   * @param userId - ユーザーID
   * @param videoId - 動画ID
   * @param updates - 更新するフィールド
   * @returns 更新されたユーザー設定エンティティ
   * @throws {EntityNotFoundError} 設定が存在しない場合
   */
  update(userId: string, videoId: string, updates: UpdateUserSettingInput): Promise<UserSettingEntity>;

  /**
   * ユーザー設定を削除
   *
   * @param userId - ユーザーID
   * @param videoId - 動画ID
   */
  delete(userId: string, videoId: string): Promise<void>;
}
