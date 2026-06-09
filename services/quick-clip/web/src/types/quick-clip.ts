export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type BatchStage = 'downloading' | 'analyzing' | 'clipping' | 'aggregating';

export type HighlightStatus = 'accepted' | 'rejected' | 'unconfirmed';
export type ClipStatus = 'PENDING' | 'GENERATING' | 'GENERATED' | 'FAILED';
export type HighlightSource = 'motion' | 'volume' | 'emotion' | 'both';

export type Job = {
  jobId: string;
  batchJobId?: string;
  batchStage?: BatchStage;
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
  expiresAt: number;
};

export type UpdateHighlightInput = {
  startSec?: number;
  endSec?: number;
  status?: HighlightStatus;
  clipStatus?: ClipStatus;
};

/** Whisper 文字起こしの1セグメント。 */
export type TranscriptSegment = {
  /** セグメント開始時刻（秒）。 */
  start: number;
  /** セグメント終了時刻（秒）。 */
  end: number;
  /** 書き起こしテキスト。 */
  text: string;
};
