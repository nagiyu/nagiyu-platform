/**
 * Playwright 自動化スクリプトの型定義
 */

import type { MylistRegistrationJobInput } from '@nagiyu/niconico-mylist-assistant-core';

/**
 * マイリスト登録ジョブのパラメータ
 *
 * web からの入力 (core と共有) に、AWS Batch が実行時に割り当てるジョブ ID を足したもの。
 */
export interface MylistRegistrationJobParams extends MylistRegistrationJobInput {
  /** バッチジョブID (AWS Batch Job ID) */
  jobId: string;
}

/**
 * マイリスト登録の結果
 */
export interface MylistRegistrationResult {
  /** 成功した動画ID */
  successVideoIds: string[];
  /** 失敗した動画ID */
  failedVideoIds: string[];
  /** エラーメッセージ（失敗時） */
  errorMessage?: string;
}
