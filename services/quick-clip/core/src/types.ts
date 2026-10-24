import type { EmotionLabel, HighlightSource } from './libs/highlight-extractor.service.js';

export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type BatchStage = 'downloading' | 'analyzing' | 'clipping' | 'aggregating';

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
  // 動画の再生時間(秒)。Job Definition 選択の尺軸に使用する。取得できなかった場合は未設定
  durationSec?: number;
  // 作成時刻 (ミリ秒)
  createdAt: number;
  // 削除予定時刻 (ミリ秒)。保存時に TTL 属性 (エポック秒) へ変換される
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
  // clipStatus を GENERATING にした時刻 (ミリ秒)。Lambda が強制終了されて GENERATING のまま
  // 残った見どころを、経過時間で見分けるために使う。この項目の導入前のデータには無い
  clipGeneratingStartedAt?: number;
  dominantEmotion?: EmotionLabel;
  // 削除予定時刻 (ミリ秒)。保存時に TTL 属性 (エポック秒) へ変換される
  expiresAt: number;
};

export type JobKey = {
  jobId: string;
};

export type HighlightKey = {
  jobId: string;
  highlightId: string;
};

export type CreateJobInput = {
  originalFileName: string;
  fileSize: number;
  durationSec?: number;
};

export type UpdateHighlightInput = {
  startSec?: number;
  endSec?: number;
  status?: HighlightStatus;
  clipStatus?: ClipStatus;
  clipGeneratingStartedAt?: number;
};
