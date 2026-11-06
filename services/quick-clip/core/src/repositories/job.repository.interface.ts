import type { AnalysisProgress, BatchStage, Job, UsageRecord } from '../types.js';

export interface JobRepository {
  getById(jobId: string): Promise<Job | null>;
  create(job: Job): Promise<Job>;
  updateBatchJobId(jobId: string, batchJobId: string): Promise<void>;
  updateBatchStage(jobId: string, batchStage: BatchStage): Promise<void>;
  updateErrorMessage(jobId: string, errorMessage: string): Promise<void>;
  updateAnalysisProgress(jobId: string, progress: AnalysisProgress): Promise<void>;
  /**
   * 戻し済みの印を、まだ付いていないときだけ付ける。
   *
   * @returns この呼び出しで付けられたとき true。既に付いていたとき false (戻す権利は先に付けた側にある)
   */
  markUsageReleased(jobId: string): Promise<boolean>;
  /**
   * 付け替え済みの印を、まだ付いていないときだけ付ける。
   *
   * @returns この呼び出しで付けられたとき true
   */
  markUsageSwitched(jobId: string): Promise<boolean>;
  /** 回数の記録を書き換える (付け替えの結果の反映) */
  updateUsage(jobId: string, usage: UsageRecord): Promise<void>;
}
