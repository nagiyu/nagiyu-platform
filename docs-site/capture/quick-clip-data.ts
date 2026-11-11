/**
 * quick-clip の撮影に使うデータ。
 * サービスの E2E と同じく、API の応答は画面側で差し替える。ジョブや見どころの値はここで決め、毎回同じ画像になるようにする。
 * 時刻は実行日に左右されないよう固定する。
 */

const at = (iso: string): number => new Date(iso).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

export const MB = 1024 * 1024;
export const GB = 1024 * MB;

/** ジョブの作成時刻。画面に出る有効期限は、この 24 時間後 */
const CREATED_AT = at('2026-02-28T01:05:30Z');
export const EXPIRES_AT = CREATED_AT + DAY_MS;

export const JOB_ID = '3f8a1c52-7d9e-4b26-a1f3-0c5e8d2b9a41';
export const MISSING_JOB_ID = '00000000-0000-4000-8000-000000000000';

export type BatchStage = 'downloading' | 'analyzing' | 'clipping' | 'aggregating';
export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

type AnalysisItem = {
  status: 'in_progress' | 'done' | 'failed';
  completed?: number;
  total?: number;
};

export interface JobResponse {
  jobId: string;
  status: JobStatus;
  originalFileName: string;
  fileSize: number;
  createdAt: number;
  expiresAt: number;
  batchStage?: BatchStage;
  errorMessage?: string;
  analysisProgress?: {
    motion: AnalysisItem;
    volume: AnalysisItem;
    transcription?: AnalysisItem;
    emotionScoring?: AnalysisItem;
  };
}

function job(status: JobStatus, extra: Partial<JobResponse> = {}): JobResponse {
  return {
    jobId: JOB_ID,
    status,
    originalFileName: 'game-stream-2026-02-27.mp4',
    fileSize: 3 * GB,
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    ...extra,
  };
}

/** Batch に投入済みで、まだ動き出していない */
export const PENDING_JOB = job('PENDING');

/** 解析の最中。AI 解析ありで、文字起こしまで進んでいる */
export const ANALYZING_JOB = job('PROCESSING', {
  batchStage: 'analyzing',
  analysisProgress: {
    motion: { status: 'done' },
    volume: { status: 'in_progress', completed: 3, total: 6 },
    transcription: { status: 'in_progress', completed: 2, total: 4 },
  },
});

/** 解析のあとの、クリップを切り出している最中 */
export const CLIPPING_JOB = job('PROCESSING', { batchStage: 'clipping' });

/** 文字起こしだけが失敗してスキップされた。感情分析は文字起こしがないので走らない */
export const SKIPPED_AI_JOB = job('PROCESSING', {
  batchStage: 'analyzing',
  analysisProgress: {
    motion: { status: 'in_progress', completed: 4, total: 6 },
    volume: { status: 'done' },
    transcription: { status: 'failed' },
  },
});

export const COMPLETED_JOB = job('COMPLETED');

export const FAILED_JOB = job('FAILED', {
  errorMessage: '動画の長さがご利用の上限を超えているため、処理できませんでした',
});

export type HighlightSource = 'motion' | 'volume' | 'emotion' | 'both';
export type HighlightStatus = 'accepted' | 'rejected' | 'unconfirmed';
export type ClipStatus = 'PENDING' | 'GENERATING' | 'GENERATED' | 'FAILED';

export interface HighlightResponse {
  highlightId: string;
  jobId: string;
  order: number;
  startSec: number;
  endSec: number;
  source: HighlightSource;
  status: HighlightStatus;
  clipStatus: ClipStatus;
  clipGeneratingStartedAt?: number;
  dominantEmotion?: 'laugh' | 'excite' | 'touch' | 'tension';
  expiresAt: number;
  clipUrl?: string;
}

/** 作り直しを始めた時刻。止まったとみなされる 360 秒より前に収める */
const REGENERATING_SINCE = at('2026-02-28T01:29:40Z');

function highlight(
  order: number,
  startSec: number,
  endSec: number,
  source: HighlightSource,
  status: HighlightStatus,
  extra: Partial<HighlightResponse> = {}
): HighlightResponse {
  const highlightId = `h-${String(order).padStart(2, '0')}`;
  return {
    highlightId,
    jobId: JOB_ID,
    order,
    startSec,
    endSec,
    source,
    status,
    clipStatus: 'GENERATED',
    expiresAt: EXPIRES_AT,
    clipUrl: `https://clips.example.test/${highlightId}.mp4`,
    ...extra,
  };
}

/** 動画の先頭から順に並ぶ 8 件。全クリップが生成済み */
export const HIGHLIGHTS: HighlightResponse[] = [
  highlight(1, 72, 92, 'motion', 'unconfirmed'),
  highlight(2, 245, 265, 'volume', 'accepted'),
  highlight(3, 520, 540, 'both', 'accepted'),
  highlight(4, 801.4, 821.4, 'emotion', 'unconfirmed', { dominantEmotion: 'laugh' }),
  highlight(5, 1195, 1215, 'motion', 'rejected'),
  highlight(6, 1650, 1670, 'volume', 'unconfirmed'),
  highlight(7, 1988, 2008, 'emotion', 'accepted', { dominantEmotion: 'excite' }),
  highlight(8, 2477, 2497, 'both', 'unconfirmed'),
];

/** 「選んだ見どころ」にする 3 番。文字起こしの行がここに重なる */
export const SELECTED_HIGHLIGHT_ORDER = 3;

/** 3 番の作り直しが進んでいる最中 */
export const REGENERATING_HIGHLIGHTS: HighlightResponse[] = HIGHLIGHTS.map((h) =>
  h.order === SELECTED_HIGHLIGHT_ORDER
    ? {
        ...h,
        clipStatus: 'GENERATING',
        clipGeneratingStartedAt: REGENERATING_SINCE,
        clipUrl: undefined,
      }
    : h
);

/** 3 番の作り直しが失敗した。採用中なので、ZIP のダウンロードが止まる */
export const FAILED_CLIP_HIGHLIGHTS: HighlightResponse[] = HIGHLIGHTS.map((h) =>
  h.order === SELECTED_HIGHLIGHT_ORDER ? { ...h, clipStatus: 'FAILED', clipUrl: undefined } : h
);

export const TRANSCRIPT_SEGMENTS = [
  { start: 512.4, end: 518.9, text: 'さあ、ここからボス戦です' },
  { start: 521.2, end: 526.0, text: 'うわっ、今の攻撃やばい！' },
  { start: 527.3, end: 533.8, text: 'ギリギリ避けた、HP 残り 1 割です' },
  { start: 535.1, end: 539.6, text: 'いける、いける、ここで決める！' },
  { start: 541.0, end: 546.2, text: 'やった、倒しました！' },
];

type UsageTier = 'anonymous' | 'free' | 'standard' | 'pro' | 'unlimited';

function usage(
  tier: UsageTier,
  limits: { aiPerMonth: number | null; noAiPerMonth: number | null; maxDurationSec: number },
  remaining: { ai: number | null; noAi: number | null }
) {
  return { month: '202602', tier, limits, used: { ai: 0, noAi: 0 }, remaining };
}

/** ログイン済みの無料の段。AI 解析ありが 1 回、なしが 3 回残っている */
export const FREE_USAGE = usage(
  'free',
  { aiPerMonth: 1, noAiPerMonth: 3, maxDurationSec: 120 * 60 },
  { ai: 1, noAi: 3 }
);

/** 未ログイン。AI 解析ありの上限が 0 回 */
export const ANONYMOUS_USAGE = usage(
  'anonymous',
  { aiPerMonth: 0, noAiPerMonth: 3, maxDurationSec: 60 * 60 },
  { ai: 0, noAi: 3 }
);

/** 無料の段で、AI 解析ありを使い切った */
export const EXHAUSTED_USAGE = usage(
  'free',
  { aiPerMonth: 1, noAiPerMonth: 3, maxDurationSec: 120 * 60 },
  { ai: 0, noAi: 2 }
);

/** 動画の長さの上限を超えた例で、ブラウザが返す再生時間 (150 分) */
export const OVER_LIMIT_DURATION_SEC = 150 * 60;

/** 800 バイトほどの 1 秒の WebM (単色)。クリップのプレビューに使い、動画が実際に読めた状態にする。外部の素材に頼らないよう、中身をここに持つ */
export const SAMPLE_CLIP_WEBM_BASE64 = [
  'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAALZEU2bdLpNu4tT',
  'q4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggEfTbuMU6uEHFO7a1OsggLD7AEA',
  'AAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZm',
  'NjAuMTYuMTAwV0GNTGF2ZjYwLjE2LjEwMESJiECPQAAAAAAAFlSua8KuAQAAAAAAADnXgQFzxYgt',
  'jK/D09+8spyBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhAvrwgDgirCCAUC6gbSagQISVMNn/HNz',
  'oGPAgGfImkWjh0VOQ09ERVJEh41MYXZmNjAuMTYuMTAwc3PWY8CLY8WILYyvw9PfvLJnyKFFo4dF',
  'TkNPREVSRIeUTGF2YzYwLjMxLjEwMiBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAxLjAw',
  'MDAwMDAwMAAfQ7Z1QR3ngQCjQJuBAACAUA8AnQEqQAG0AABHCIWFiIWEiAICAnWqAgZmZPcGgWSf',
  'a9ubJzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7',
  'Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jy4A/v5YKX/kp/Xd5Rc9361M',
  'jHz7gKOdgQDIALECAAEQEAAYABhYL/QACIAEM1+tck+VgACjnYEBkACxAgABEBAAGAAYWC/0AAiA',
  'BDNfrXJPlYAAo52BAlgAsQIAARAQABgAGFgv9AAIgAQzX61yT5WAAKOdgQMgALECAAEQEAAYABhY',
  'L/QACIAEM1+tck+VgAAcU7trkbuPs4EAt4r3gQHxggGg8IED',
].join('');

/**
 * Google IMA SDK の代わりに返すスクリプト。広告の要求を受けても何も返さず、広告枠が出たままになる。
 * 実際の SDK は外部の配信元から読み込み、撮影のたびに内容が変わるため使わない。
 */
export const IMA_SDK_STUB = `
window.google = { ima: {
  ViewMode: { NORMAL: 'normal', FULLSCREEN: 'fullscreen' },
  AdDisplayContainer: function () { this.initialize = function () {}; this.destroy = function () {}; },
  AdsLoader: function () {
    this.addEventListener = function () {};
    this.requestAds = function () {};
    this.contentComplete = function () {};
    this.destroy = function () {};
  },
  AdsRequest: function () {},
  AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: 'adsManagerLoaded' } },
  AdEvent: { Type: { COMPLETE: 'complete', SKIPPED: 'skip', ALL_ADS_COMPLETED: 'allAdsCompleted' } },
  AdErrorEvent: { Type: { AD_ERROR: 'adError' } },
} };
`;
