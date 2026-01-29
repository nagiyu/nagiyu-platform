/**
 * 動画基本情報（VIDEO エンティティ）
 */
export interface VideoBasicInfo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  length: string;
  createdAt: string;
}

/**
 * ユーザー設定（USER_SETTING エンティティ）
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
 * 動画統合型（DynamoDB格納用）
 * 動画基本情報とユーザー設定を統合
 */
export interface Video {
  videoId: string;
  title: string;
  description?: string;
  thumbnailUrl: string;
  duration?: number;
  viewCount?: number;
  commentCount?: number;
  mylistCount?: number;
  uploadedAt?: string;
  tags?: string[];
  isFavorite: boolean;
  isSkip: boolean;
  memo?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 動画設定更新用型
 */
export interface VideoSettings {
  isFavorite?: boolean;
  isSkip?: boolean;
  memo?: string;
}

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
