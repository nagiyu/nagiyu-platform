/**
 * NiconicoMylistAssistant Core - UserSetting Entity
 *
 * ユーザー設定のビジネスオブジェクト（PK/SKを持たない純粋なエンティティ）
 */

/**
 * ユーザー設定エンティティ
 *
 * DynamoDBの実装詳細（PK/SK）を含まない純粋なビジネスオブジェクト
 */
export interface UserSettingEntity {
  /** ユーザーID */
  userId: string;
  /** 動画ID */
  videoId: string;
  /** お気に入りフラグ */
  isFavorite: boolean;
  /** スキップフラグ */
  isSkip: boolean;
  /** メモ */
  memo?: string;
  /** 作成日時 (Unix timestamp) */
  CreatedAt: number;
  /** 更新日時 (Unix timestamp) */
  UpdatedAt: number;
}

/**
 * UserSetting作成時の入力データ（CreatedAt/UpdatedAtを含まない）
 */
export type CreateUserSettingInput = Omit<UserSettingEntity, 'CreatedAt' | 'UpdatedAt'>;

/**
 * UserSetting更新時の入力データ（更新可能なフィールドのみ）
 */
export type UpdateUserSettingInput = Partial<
  Pick<UserSettingEntity, 'isFavorite' | 'isSkip' | 'memo'>
>;

/**
 * UserSettingのビジネスキー
 */
export interface UserSettingKey {
  userId: string;
  videoId: string;
}
