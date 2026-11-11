/**
 * codec-converter の撮影に使うデータ。
 * ジョブは偽の AWS (DynamoDB / S3 / Batch) に投入する。時刻は実行日に左右されないよう固定する。
 */

/** 偽の AWS を待ち受けるポート。S3 を path-style で扱わせるため、ホストは IP で指す */
export const FAKE_AWS_PORT = 43298;
export const FAKE_AWS_URL = `http://127.0.0.1:${FAKE_AWS_PORT}`;

export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type Codec = 'h264' | 'vp9' | 'av1';

export interface SeedJob {
  jobId: string;
  status: JobStatus;
  inputFile: string;
  outputFile?: string;
  outputCodec: Codec;
  fileName: string;
  fileSize: number;
  /** epoch ミリ秒 */
  createdAt: number;
  updatedAt: number;
  /** 偽の AWS へは TTL (epoch 秒) として渡す */
  expiresAt: number;
  errorMessage?: string;
}

const at = (iso: string): number => new Date(iso).getTime();
const MB = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

function job(
  jobId: string,
  status: JobStatus,
  outputCodec: Codec,
  fileName: string,
  fileSizeMb: number,
  extra: Partial<SeedJob> = {}
): SeedJob {
  const createdAt = at('2026-02-28T01:05:30Z');
  return {
    jobId,
    status,
    inputFile: `uploads/${jobId}/input.mp4`,
    outputCodec,
    fileName,
    fileSize: Math.round(fileSizeMb * MB),
    createdAt,
    updatedAt: createdAt + 90_000,
    expiresAt: Math.floor((createdAt + DAY_MS) / 1000),
    ...extra,
  };
}

export const PENDING_JOB = job(
  '3f8a1c52-7d9e-4b26-a1f3-0c5e8d2b9a41',
  'PENDING',
  'h264',
  'family-trip-2026.mp4',
  48.3
);

export const PROCESSING_JOB = job(
  '7b2e9d14-5a6c-4f83-b0e7-1d4c8a3f6e92',
  'PROCESSING',
  'vp9',
  'conference-talk.mp4',
  212.6
);

export const COMPLETED_JOB = job(
  'c91d4e07-2b8a-4a5f-9e36-8f7a1b0c3d55',
  'COMPLETED',
  'h264',
  'family-trip-2026.mp4',
  48.3,
  {
    outputFile: 'outputs/c91d4e07-2b8a-4a5f-9e36-8f7a1b0c3d55/output.mp4',
    updatedAt: at('2026-02-28T01:12:05Z'),
  }
);

export const FAILED_JOB = job(
  'e5a07b83-9c14-4d62-8a1f-2b6d9e0c7f38',
  'FAILED',
  'av1',
  'screen-recording.mp4',
  356.9,
  {
    errorMessage:
      'FFmpegの実行に失敗しました: exit code 1, stderr: Invalid data found when processing input',
    updatedAt: at('2026-02-28T01:09:41Z'),
  }
);

/** 存在しないジョブ ID */
export const MISSING_JOB_ID = '00000000-0000-4000-8000-000000000000';

/** 偽の AWS にジョブを 1 件投入する (同じ ID なら上書き) */
export async function seedJob(seed: SeedJob): Promise<void> {
  const response = await fetch(`${FAKE_AWS_URL}/__admin/job`, {
    method: 'POST',
    body: JSON.stringify(seed),
  });
  if (!response.ok) {
    throw new Error(`ジョブの投入に失敗しました: ${response.status}`);
  }
}

/** 偽の AWS の障害の注入。引数の項目だけを変える */
export async function setToggles(toggles: {
  ddbFail?: boolean;
  s3PutFail?: boolean;
  s3HeadFail?: boolean;
  batchFail?: 'jobdef' | 'all' | null;
  delayMs?: number;
}): Promise<void> {
  const response = await fetch(`${FAKE_AWS_URL}/__admin/toggles`, {
    method: 'POST',
    body: JSON.stringify(toggles),
  });
  if (!response.ok) {
    throw new Error(`障害の設定に失敗しました: ${response.status}`);
  }
}

/** 注入した障害をすべて戻す */
export async function clearToggles(): Promise<void> {
  await setToggles({
    ddbFail: false,
    s3PutFail: false,
    s3HeadFail: false,
    batchFail: null,
    delayMs: 0,
  });
}
