import type { Highlight, Job, UpdateHighlightInput } from '@/types/quick-clip';

export interface JobRepository {
  getById(jobId: string): Promise<Job | null>;
  create(job: Job): Promise<Job>;
  updateStatus(jobId: string, status: Job['status'], errorMessage?: string): Promise<Job>;
}

export interface HighlightRepository {
  getByJobId(jobId: string): Promise<Highlight[]>;
  getById(jobId: string, highlightId: string): Promise<Highlight | null>;
  update(jobId: string, highlightId: string, updates: UpdateHighlightInput): Promise<Highlight>;
}
