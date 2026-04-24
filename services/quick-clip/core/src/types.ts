import type { EmotionLabel, HighlightSource } from './libs/highlight-extractor.service.js';

export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type BatchStage = 'downloading' | 'analyzing' | 'aggregating';

export type AnalysisProgressItem = {
  status: 'in_progress' | 'done' | 'failed';
  completed?: number;
  total?: number;
};

export type AnalysisProgress = {
  motion: AnalysisProgressItem;
  volume: AnalysisProgressItem;
  transcription?: AnalysisProgressItem;
  emotionScoring?: AnalysisProgressItem;
};

export type HighlightStatus = 'accepted' | 'rejected' | 'unconfirmed';
export type ClipStatus = 'PENDING' | 'GENERATING' | 'GENERATED' | 'FAILED';

export type Job = {
  jobId: string;
  batchJobId?: string;
  batchStage?: BatchStage;
  originalFileName: string;
  fileSize: number;
  createdAt: number;
  expiresAt: number;
  errorMessage?: string;
  analysisProgress?: AnalysisProgress;
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
  dominantEmotion?: EmotionLabel;
  expiresAt: number;
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
