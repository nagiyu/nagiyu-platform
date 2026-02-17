/**
 * BatchJob Entity
 *
 * バッチジョブのステータスと結果を管理するエンティティ
 *
 * @see api-spec.md Section 5.4
 */

import { BatchStatus, BatchResult } from '../types/index.js';

/**
 * BatchJob Entity
 *
 * DynamoDB に保存されるバッチジョブ情報の型
 */
export interface BatchJobEntity {
  /**
   * バッチジョブ ID
   * 例: "batch-job-20260116-123456-abc123"
   */
  jobId: string;

  /**
   * ユーザー ID
   * ジョブを投入したユーザー
   */
  userId: string;

  /**
   * ジョブステータス
   */
  status: BatchStatus;

  /**
   * 実行結果（完了時のみ）
   */
  result?: BatchResult;

  /**
   * ジョブ作成日時 (Unix timestamp)
   */
  CreatedAt: number;

  /**
   * ジョブ更新日時 (Unix timestamp)
   */
  UpdatedAt: number;

  /**
   * ジョブ完了日時 (Unix timestamp, 完了時のみ)
   */
  CompletedAt?: number;

  /**
   * 二段階認証コード（Web から入力される、一時的なデータ）
   * 使用後は削除される
   */
  twoFactorAuthCode?: string;

  /**
   * Web Push サブスクリプション情報（バッチ完了通知用）
   * ジョブ作成時に設定される
   */
  pushSubscription?: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
}

/**
 * BatchJob 作成用入力型
 */
export type CreateBatchJobInput = Omit<BatchJobEntity, 'CreatedAt' | 'UpdatedAt' | 'CompletedAt'>;

/**
 * BatchJob 更新用入力型
 */
export interface UpdateBatchJobInput {
  status: BatchStatus;
  result?: BatchResult;
  completedAt?: number;
  twoFactorAuthCode?: string;
}

/**
 * BatchJob キー（PK/SK 情報）
 */
export interface BatchJobKey {
  jobId: string;
  userId: string;
}
