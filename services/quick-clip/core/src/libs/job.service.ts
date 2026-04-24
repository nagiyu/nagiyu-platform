import { randomUUID } from 'node:crypto';
import type { JobRepository } from '../repositories/job.repository.interface.js';
import type { AnalysisProgress, BatchStage, CreateJobInput, Job } from '../types.js';
import { DOMAIN_ERROR_MESSAGES } from './domain-error-messages.js';

const JOB_TTL_SECONDS = 24 * 60 * 60;

export class JobService {
  private readonly jobRepository: JobRepository;

  constructor(jobRepository: JobRepository) {
    this.jobRepository = jobRepository;
  }

  public async createJob(input: CreateJobInput): Promise<Job> {
    const originalFileName = input.originalFileName.trim();
    if (originalFileName.length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.FILE_NAME_REQUIRED);
    }
    if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.FILE_SIZE_INVALID);
    }

    const createdAt = Math.floor(Date.now() / 1000);
    const job: Job = {
      jobId: randomUUID(),
      originalFileName,
      fileSize: input.fileSize,
      createdAt,
      expiresAt: createdAt + JOB_TTL_SECONDS,
    };

    return this.jobRepository.create(job);
  }

  public async getJob(jobId: string): Promise<Job | null> {
    if (jobId.trim().length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.JOB_ID_REQUIRED);
    }
    return this.jobRepository.getById(jobId);
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

  public async updateAnalysisProgress(
    jobId: string,
    progress: AnalysisProgress
  ): Promise<void> {
    if (jobId.trim().length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.JOB_ID_REQUIRED);
    }
    return this.jobRepository.updateAnalysisProgress(jobId, progress);
  }
}
