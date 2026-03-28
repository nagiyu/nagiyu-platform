export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type HighlightStatus = 'accepted' | 'rejected' | 'pending';

export type PocJob = {
  jobId: string;
  status: JobStatus;
  originalFileName: string;
  fileSize: number;
  createdAt: number;
  expiresAt: number;
  errorMessage?: string;
};

export type PocHighlight = {
  highlightId: string;
  jobId: string;
  order: number;
  startSec: number;
  endSec: number;
  status: HighlightStatus;
};
