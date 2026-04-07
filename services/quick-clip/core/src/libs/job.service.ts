import { randomUUID } from 'node:crypto';
import type { JobRepository } from '../repositories/job.repository.interface.js';
import type { CreateJobInput, Job } from '../types.js';
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
      throw new Error(DOMAIN_ERROR_MESSAGES.JOB_ID_REQUIRED);
    }
    return this.jobRepository.getById(jobId);
  }

  public async updateStatus(
    jobId: string,
    status: Job['status'],
    errorMessage?: string
  ): Promise<Job> {
    if (jobId.trim().length === 0) {
      throw new Error(DOMAIN_ERROR_MESSAGES.JOB_ID_REQUIRED);
    }

    const normalizedErrorMessage = errorMessage?.trim() || undefined;
    if (status === 'FAILED' && !normalizedErrorMessage) {
      throw new Error(DOMAIN_ERROR_MESSAGES.ERROR_MESSAGE_REQUIRED);
    }

    return this.jobRepository.updateStatus(jobId, status, normalizedErrorMessage);
  }
}
