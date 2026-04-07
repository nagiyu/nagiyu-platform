import type { Job } from '../types.js';

export interface JobRepository {
  getById(jobId: string): Promise<Job | null>;
  create(job: Job): Promise<Job>;
  updateStatus(jobId: string, status: Job['status'], errorMessage?: string): Promise<Job>;
}
