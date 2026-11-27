import { randomUUID } from 'node:crypto';
import type { JobRepository } from '../repositories/job.repository.interface.js';
import type { AnalysisProgress, BatchStage, CreateJobInput, Job } from '../types.js';
import { DOMAIN_ERROR_MESSAGES } from './domain-error-messages.js';

const JOB_TTL_MS = 24 * 60 * 60 * 1000;

export class JobService {
  private readonly jobRepository: JobRepository;
  private readonly now: () => number;

  /**
   * @param now - 現在時刻 (ミリ秒) を返す関数。期限の判定を時刻に依存させずに確かめるため、差し替えられる
   */
  constructor(jobRepository: JobRepository, now: () => number = () => Date.now()) {
    this.jobRepository = jobRepository;
    this.now = now;
  }

  public async createJob(input: CreateJobInput): Promise<Job> {
    const originalFileName = input.originalFileName.trim();
    if (originalFileName.length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.FILE_NAME_REQUIRED);
    }
    if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.FILE_SIZE_INVALID);
    }
    if (
      input.durationSec !== undefined &&
      (!Number.isFinite(input.durationSec) || input.durationSec <= 0)
    ) {
      throw new Error(DOMAIN_ERROR_MESSAGES.DURATION_INVALID);
    }

    const createdAt = this.now();
    const job: Job = {
      jobId: randomUUID(),
      originalFileName,
      fileSize: input.fileSize,
      ...(input.durationSec !== undefined ? { durationSec: input.durationSec } : {}),
      ...(input.usage ? { usage: input.usage } : {}),
      ...(input.aiAnalysis !== undefined ? { aiAnalysis: input.aiAnalysis } : {}),
      ...(input.maxDurationSec !== undefined ? { maxDurationSec: input.maxDurationSec } : {}),
      createdAt,
      expiresAt: createdAt + JOB_TTL_MS,
    };

    return this.jobRepository.create(job);
  }

  public async getJob(jobId: string): Promise<Job | null> {
    if (jobId.trim().length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.JOB_ID_REQUIRED);
    }
    return this.jobRepository.getById(jobId);
  }

  /**
   * 期限 (expiresAt) を過ぎていないジョブを取得する。期限を過ぎたジョブは null を返す。
   *
   * TTL による削除は期限から遅れるため、削除の前後で見え方を変えないよう、利用者向けの参照はこちらを使う。
   * 処理中のジョブの記録や回数の戻しを期限で止めないため、Batch は getJob を使う
   */
  public async getActiveJob(jobId: string): Promise<Job | null> {
    const job = await this.getJob(jobId);
    if (job === null || job.expiresAt <= this.now()) {
      return null;
    }
    return job;
  }

  public async updateBatchJobId(jobId: string, batchJobId: string): Promise<void> {
    if (jobId.trim().length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.JOB_ID_REQUIRED);
    }
    return this.jobRepository.updateBatchJobId(jobId, batchJobId);
  }

  public async updateBatchStage(jobId: string, batchStage: BatchStage): Promise<void> {
    if (jobId.trim().length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.JOB_ID_REQUIRED);
    }
    return this.jobRepository.updateBatchStage(jobId, batchStage);
  }

  public async updateErrorMessage(jobId: string, errorMessage: string): Promise<void> {
    if (jobId.trim().length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.JOB_ID_REQUIRED);
    }
    const normalizedErrorMessage = errorMessage.trim();
    if (normalizedErrorMessage.length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.ERROR_MESSAGE_REQUIRED);
    }
    return this.jobRepository.updateErrorMessage(jobId, normalizedErrorMessage);
  }

  /** Batch が計った実際の動画の長さで上書きする */
  public async updateDurationSec(jobId: string, durationSec: number): Promise<void> {
    if (jobId.trim().length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.JOB_ID_REQUIRED);
    }
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.DURATION_INVALID);
    }
    return this.jobRepository.updateDurationSec(jobId, durationSec);
  }

  public async updateAnalysisProgress(jobId: string, progress: AnalysisProgress): Promise<void> {
    if (jobId.trim().length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.JOB_ID_REQUIRED);
    }
    return this.jobRepository.updateAnalysisProgress(jobId, progress);
  }
}
