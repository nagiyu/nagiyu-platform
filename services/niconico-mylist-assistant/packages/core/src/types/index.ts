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
 * バッチジョブステータス
 */
export type BatchStatus = "SUBMITTED" | "RUNNING" | "SUCCEEDED" | "FAILED";

/**
 * バッチジョブ結果
 */
export interface BatchResult {
  registeredCount: number;
  failedCount: number;
  totalCount: number;
  errorMessage?: string;
}
