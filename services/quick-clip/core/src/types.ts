import type { HighlightSource } from './libs/highlight-extractor.service.js';

export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type HighlightStatus = 'accepted' | 'rejected' | 'unconfirmed';
export type ClipStatus = 'PENDING' | 'GENERATING' | 'GENERATED' | 'FAILED';

export type Job = {
  jobId: string;
  status: JobStatus;
  originalFileName: string;
  fileSize: number;
  createdAt: number;
  expiresAt: number;
  errorMessage?: string;
};

export type Highlight = {
  highlightId: string;
  jobId: string;
  order: number;
  startSec: number;
  endSec: number;
  source: HighlightSource;
  status: HighlightStatus;
  clipStatus: ClipStatus;
};

export type CreateJobInput = {
  originalFileName: string;
  fileSize: number;
};

export type UpdateHighlightInput = {
  startSec?: number;
  endSec?: number;
  status?: HighlightStatus;
  clipStatus?: ClipStatus;
};
