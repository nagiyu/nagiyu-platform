// ============================================================================
// 動画情報型定義（API レスポンス用）
// ============================================================================

/**
 * Video - 動画基本情報（API レスポンス用）
 *
 * ニコニコ動画から取得した動画のメタデータ。全ユーザーで共有される共通データ。
 * @see api-spec.md Section 5.1
 */
export interface Video {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  length: string;
  createdAt: string;
  videoUpdatedAt?: string;
}

/**
 * UserSetting - ユーザー設定（API レスポンス用）
 *
 * 各ユーザーが個別に設定する動画のメタデータ（お気に入りフラグ、スキップフラグ、メモ）。
 * @see api-spec.md Section 5.2
 */
export interface UserSetting {
  videoId: string;
  isFavorite: boolean;
  isSkip: boolean;
  memo?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * VideoData - 動画データ（API レスポンス用）
 *
 * 動画基本情報とユーザー設定を結合したデータ。API レスポンスで返される主要なデータモデル。
 * @see api-spec.md Section 5.3
 */
export interface VideoData {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  length: string;
  createdAt: string;
  userSetting?: UserSetting;
}

/**
 * VideoMetadata - 動画メタデータ（Video の別名）
 *
 * @deprecated Video 型を使用してください
 */
export type VideoMetadata = Video;

// ============================================================================
// DynamoDB 内部型定義
// ============================================================================

/**
 * VideoBasicInfo - 動画基本情報（DynamoDB 内部用）
 * @internal
 */
export interface VideoBasicInfo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  length: string;
  createdAt: string;
  videoUpdatedAt?: string;
}

/**
 * UserVideoSetting - ユーザー設定（DynamoDB 内部用）
 * @internal
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

// ============================================================================
// API リクエスト・レスポンス型定義
// ============================================================================

/**
 * ErrorResponse - エラーレスポンス
 *
 * 全 API エンドポイントで使用される標準エラーレスポンス。
 * @see api-spec.md Section 2.3
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * HealthCheckResponse - ヘルスチェックレスポンス
 *
 * @see api-spec.md Section 3.1.1
 */
export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  version: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * VideosListResponse - 動画一覧取得レスポンス
 *
 * @see api-spec.md Section 3.2.1
 */
export interface VideosListResponse {
  videos: VideoData[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * VideoDetailResponse - 動画詳細取得レスポンス
 *
 * @see api-spec.md Section 3.2.2
 */
export type VideoDetailResponse = VideoData;

/**
 * BulkImportRequest - 一括インポートリクエスト
 *
 * @see api-spec.md Section 3.4.1
 */
export interface BulkImportRequest {
  videoIds: string[];
}

/**
 * BulkImportResponse - 一括インポートレスポンス
 *
 * @see api-spec.md Section 3.4.1
 */
export interface BulkImportResponse {
  success: number;
  failed: number;
  skipped: number;
  total: number;
  failedDetails?: Array<{
    videoId: string;
    error: string;
  }>;
}

/**
 * VideoSettingUpdateRequest - 動画設定更新リクエスト
 *
 * @see api-spec.md Section 3.5.1
 */
export interface VideoSettingUpdateRequest {
  isFavorite?: boolean;
  isSkip?: boolean;
  memo?: string;
}

/**
 * EstimateRequest - 登録予定動画数の見積もりリクエスト
 *
 * @see api-spec.md Section 3.6.1
 */
export interface EstimateRequest {
  maxVideos: number;
  isFavorite?: boolean;
  excludeSkipped?: boolean;
}

/**
 * EstimateResponse - 登録予定動画数の見積もりレスポンス
 *
 * @see api-spec.md Section 3.6.1
 */
export interface EstimateResponse {
  estimatedVideos: number;
}

/**
 * BatchSubmitRequest - バッチジョブ投入リクエスト
 *
 * @see api-spec.md Section 3.6.2
 */
export interface BatchSubmitRequest {
  email: string;
  password: string;
  mylistName?: string;
  maxVideos: number;
  isFavorite?: boolean;
  excludeSkipped?: boolean;
}

/**
 * BatchSubmitResponse - バッチジョブ投入レスポンス
 *
 * @see api-spec.md Section 3.6.2
 */
export interface BatchSubmitResponse {
  jobId: string;
  status: BatchStatus;
  submittedAt: string;
}

/**
 * BatchStatusResponse - バッチジョブステータス取得レスポンス
 *
 * @see api-spec.md Section 3.6.3
 */
export interface BatchStatusResponse {
  jobId: string;
  status: BatchStatus;
  submittedAt: string;
  startedAt?: string;
  finishedAt?: string;
  result?: BatchResult;
}
