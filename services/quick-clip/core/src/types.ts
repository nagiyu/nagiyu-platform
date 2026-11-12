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

/** 利用回数の種類。AI 解析 (文字起こし + 感情分析) あり / なし */
export type UsageKind = 'ai' | 'noAi';

/**
 * ジョブを作るときに数えた 1 回の記録。
 * 処理が失敗したときに、同じ主体・月・種類の回数を戻すために使う。
 */
export type UsageRecord = {
  /** 回数を数えた主体 (ユーザーまたは匿名 ID) */
  subject: string;
  /** 数えた月 (日本時間、例: 202611) */
  month: string;
  kind: UsageKind;
  /**
   * 数えた時点の、AI 解析なしの月の上限。
   * AI 解析ありで数えたのに AI 解析ができなかったとき、AI 解析なしへ付け替えられるかを決めるために使う
   */
  noAiLimit: number;
};

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
  /** ジョブを作るときに数えた回数の記録。回数を数えなかったジョブには無く、その場合は戻す対象が無い */
  usage?: UsageRecord;
  /** AI 解析 (文字起こし + 感情分析) を行うか。無い場合は行うものとして扱う */
  aiAnalysis?: boolean;
  /** 数えた回数を戻し済みか。同じ 1 回を二重に戻さないための印で、条件付きの書き込みでだけ付ける */
  usageReleased?: boolean;
  /** AI 解析なしへの付け替え済みか。同じ付け替えを二重に行わないための印で、条件付きの書き込みでだけ付ける */
  usageSwitched?: boolean;
  /** このジョブに許される動画の長さの上限 (秒)。Batch が実際の長さと照合し、無い場合は照合しない */
  maxDurationSec?: number;
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

/** 利用者の識別子をハッシュする、日ごとの塩 */
export type DailySalt = {
  /** 塩を使う日 (キーの値を写したもの) */
  day: string;
  salt: string;
  /** 削除予定時刻 (エポック秒)。TTL 属性にそのまま書く */
  ttlSec: number;
  /** 保存形式が持つ作成時刻 (ミリ秒)。タイムスタンプを書く前の Item には無い */
  createdAt?: number;
};

export type DailySaltKey = {
  day: string;
};

export type HighlightKey = {
  jobId: string;
  highlightId: string;
};

export type CreateJobInput = {
  originalFileName: string;
  fileSize: number;
  durationSec?: number;
  usage?: UsageRecord;
  maxDurationSec?: number;
  aiAnalysis?: boolean;
};

export type UpdateHighlightInput = {
  startSec?: number;
  endSec?: number;
  status?: HighlightStatus;
  clipStatus?: ClipStatus;
  clipGeneratingStartedAt?: number;
};
