import type { BatchStatus, BatchResult } from '@nagiyu/niconico-mylist-assistant-core';

/**
 * ジョブステータス表示コンポーネントのプロパティ
 */
export interface JobStatusDisplayProps {
  jobId: string;
  onComplete?: (result: BatchResult) => void;
  onError?: (error: string) => void;
}

/**
 * ジョブステータスの内部状態
 */
export interface JobStatusState {
  status: BatchStatus;
  result?: BatchResult;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  isLoading: boolean;
}

/**
 * ポーリング設定
 */
export interface PollingConfig {
  intervalMs: number;
  maxAttempts?: number;
}

/**
 * デフォルトのポーリング設定
 */
export const DEFAULT_POLLING_CONFIG: PollingConfig = {
  intervalMs: 5000, // 5秒ごとにポーリング
  maxAttempts: 360, // 最大30分間（5秒 × 360回）
};
