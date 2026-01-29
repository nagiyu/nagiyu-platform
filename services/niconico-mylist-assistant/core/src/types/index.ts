/**
 * 動画基本情報（VIDEO エンティティ - 全ユーザー共通）
 */
export interface VideoBasicInfo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  length: string;
  createdAt: string;
}

/**
 * ユーザー設定（USER_SETTING エンティティ - ユーザー個別）
 */
export interface UserVideoSetting {
  userId: string;
  videoId: string;
  isFavorite: boolean;
  isSkip: boolean;
  memo?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * DynamoDB 内部アイテム型（VIDEO エンティティ）
 * @internal
 */
export interface VideoItem extends VideoBasicInfo {
  PK: string; // VIDEO#{videoId}
  SK: string; // VIDEO#{videoId}
  entityType: 'VIDEO';
}

/**
 * DynamoDB 内部アイテム型（USER_SETTING エンティティ）
 * @internal
 */
export interface UserSettingItem extends UserVideoSetting {
  PK: string; // USER#{userId}
  SK: string; // VIDEO#{videoId}
  entityType: 'USER_SETTING';
}

/**
 * 動画設定更新用型
 */
export interface VideoSettingUpdate {
  isFavorite?: boolean;
  isSkip?: boolean;
  memo?: string;
}

/**
 * 動画基本情報作成用型（createdAt を除く）
 */
export type CreateVideoBasicInfoInput = Omit<VideoBasicInfo, 'createdAt'>;

/**
 * ユーザー設定作成用型（createdAt/updatedAt を除く）
 */
export type CreateUserSettingInput = Omit<UserVideoSetting, 'createdAt' | 'updatedAt'>;

/**
 * バッチジョブステータス
 */
export type BatchStatus = 'SUBMITTED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

/**
 * バッチジョブ結果
 */
export interface BatchResult {
  registeredCount: number;
  failedCount: number;
  totalCount: number;
  errorMessage?: string;
}
