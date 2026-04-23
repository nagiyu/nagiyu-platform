import type { Highlight, Job, UpdateHighlightInput } from '@/types/quick-clip';

export interface JobRepository {
  getById(jobId: string): Promise<Job | null>;
  create(job: Job): Promise<Job>;
  updateBatchJobId(jobId: string, batchJobId: string): Promise<void>;
}

export interface HighlightRepository {
  getByJobId(jobId: string): Promise<Highlight[]>;
  getById(jobId: string, highlightId: string): Promise<Highlight | null>;
  update(jobId: string, highlightId: string, updates: UpdateHighlightInput): Promise<Highlight>;
}
