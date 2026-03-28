import { randomUUID } from 'node:crypto';
import type { JobRepository } from '../repositories/job.repository.interface.js';
import type { CreateJobInput, Job } from '../types.js';

const ERROR_MESSAGES = {
  JOB_ID_REQUIRED: 'ジョブIDは必須です',
  FILE_NAME_REQUIRED: 'ファイル名は必須です',
  FILE_SIZE_INVALID: 'ファイルサイズは0より大きい必要があります',
  ERROR_MESSAGE_REQUIRED: 'FAILEDステータスではエラーメッセージが必須です',
} as const;

const JOB_TTL_SECONDS = 24 * 60 * 60;

export class JobService {
  private readonly jobRepository: JobRepository;

  constructor(jobRepository: JobRepository) {
    this.jobRepository = jobRepository;
  }

  public async createJob(input: CreateJobInput): Promise<Job> {
    const originalFileName = input.originalFileName.trim();
    if (originalFileName.length === 0) {
      throw new Error(ERROR_MESSAGES.FILE_NAME_REQUIRED);
    }
    if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
      throw new Error(ERROR_MESSAGES.FILE_SIZE_INVALID);
    }

    const createdAt = Math.floor(Date.now() / 1000);
    const job: Job = {
      jobId: randomUUID(),
      status: 'PENDING',
      originalFileName,
      fileSize: input.fileSize,
      createdAt,
      expiresAt: createdAt + JOB_TTL_SECONDS,
    };

    return this.jobRepository.create(job);
  }

  public async getJob(jobId: string): Promise<Job | null> {
    if (jobId.trim().length === 0) {
      throw new Error(ERROR_MESSAGES.JOB_ID_REQUIRED);
    }
    return this.jobRepository.getById(jobId);
  }

  public async updateStatus(jobId: string, status: Job['status'], errorMessage?: string): Promise<Job> {
    if (jobId.trim().length === 0) {
      throw new Error(ERROR_MESSAGES.JOB_ID_REQUIRED);
    }

    const normalizedErrorMessage = errorMessage?.trim() || undefined;
    if (status === 'FAILED' && !normalizedErrorMessage) {
      throw new Error(ERROR_MESSAGES.ERROR_MESSAGE_REQUIRED);
    }

    return this.jobRepository.updateStatus(jobId, status, normalizedErrorMessage);
  }
}
