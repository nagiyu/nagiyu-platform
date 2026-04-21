import type { BatchStage, Job } from '../types.js';

export interface JobRepository {
  getById(jobId: string): Promise<Job | null>;
  create(job: Job): Promise<Job>;
  updateBatchJobId(jobId: string, batchJobId: string): Promise<void>;
  updateBatchStage(jobId: string, batchStage: BatchStage): Promise<void>;
  updateErrorMessage(jobId: string, errorMessage: string): Promise<void>;
}
