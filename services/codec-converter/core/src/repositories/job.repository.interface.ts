import type { Job } from '../types.js';

/** ステータス更新の内容。未指定の項目は変更しない */
export interface UpdateJobStatusInput {
  status: Job['status'];
  outputFile?: string;
  errorMessage?: string;
}

/**
 * ジョブリポジトリ
 */
export interface JobRepository {
  /** ジョブを取得する。なければ null */
  getById(jobId: string): Promise<Job | null>;

  /**
   * ジョブを作成する。
   *
   * @throws EntityAlreadyExistsError 同じ jobId のジョブが既にあるとき
   */
  create(job: Job): Promise<Job>;

  /**
   * ジョブのステータスを更新し、更新後のジョブを返す。
   *
   * @throws EntityNotFoundError 対象のジョブがないとき
   */
  updateStatus(jobId: string, input: UpdateJobStatusInput): Promise<Job>;
}
