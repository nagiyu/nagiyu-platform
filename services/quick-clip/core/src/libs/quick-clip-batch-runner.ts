import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { HighlightAggregationService } from './highlight-aggregation.service.js';
import { JobService } from './job.service.js';
import type { Highlight, JobStatus } from '../types.js';
import { FfmpegVideoAnalyzer } from './ffmpeg-video-analyzer.js';
import { MotionHighlightService } from './motion-highlight.service.js';
import { VolumeHighlightService } from './volume-highlight.service.js';
import { DynamoDBHighlightRepository } from '../repositories/dynamodb-highlight.repository.js';
import { DynamoDBJobRepository } from '../repositories/dynamodb-job.repository.js';

/** Batch 実行コマンド種別。 */
export type QuickClipBatchCommand = 'extract';

/** quick-clip batch 実行に必要な入力。環境変数の解釈は呼び出し側で行う。 */
export type QuickClipBatchRunInput = {
  command: QuickClipBatchCommand;
  /** ジョブID（英数字・アンダースコア・ハイフンのみ許可）。 */
  jobId: string;
  tableName: string;
  bucketName: string;
  awsRegion: string;
};

const ERROR_MESSAGES = {
  DOWNLOAD_FAILED: '動画ファイルのダウンロードに失敗しました',
  SOURCE_VIDEO_NOT_FOUND: (sourceVideoKey: string): string =>
    `アップロード済みの動画ファイルが見つかりません: ${sourceVideoKey}`,
} as const;

const VIDEO_INPUT_PATH = (jobId: string): string => `/tmp/quick-clip/${jobId}/input.mp4`;
const SOURCE_VIDEO_KEY = (jobId: string): string => `uploads/${jobId}/input.mp4`;
const DOWNLOAD_RETRY_INTERVAL_MS = 3000;
const DOWNLOAD_RETRY_TIMEOUT_MS = 30 * 60 * 1000;
const DOWNLOAD_RETRY_COUNT = Math.floor(DOWNLOAD_RETRY_TIMEOUT_MS / DOWNLOAD_RETRY_INTERVAL_MS);

type S3Error = {
  name?: string;
  Code?: string;
};

type ErrorWithCause = Error & { cause?: unknown };

const isNoSuchKeyError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const s3Error = error as S3Error;
  return s3Error.name === 'NoSuchKey' || s3Error.Code === 'NoSuchKey';
};

const wait = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const createDynamoDBDocumentClient = (region: string): DynamoDBDocumentClient =>
  DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });

const downloadSourceVideo = async (
  bucketName: string,
  jobId: string,
  localPath: string,
  awsRegion: string
): Promise<void> => {
  const s3Client = new S3Client({ region: awsRegion });
  const sourceVideoKey = SOURCE_VIDEO_KEY(jobId);

  for (let retryCount = 1; retryCount <= DOWNLOAD_RETRY_COUNT; retryCount += 1) {
    try {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: sourceVideoKey,
        })
      );

      if (!response.Body) {
        throw new Error(ERROR_MESSAGES.DOWNLOAD_FAILED);
      }

      await mkdir(dirname(localPath), { recursive: true });
      await pipeline(response.Body as NodeJS.ReadableStream, createWriteStream(localPath));
      return;
    } catch (error) {
      if (isNoSuchKeyError(error)) {
        if (retryCount === DOWNLOAD_RETRY_COUNT) {
          const missingSourceError = new Error(
            ERROR_MESSAGES.SOURCE_VIDEO_NOT_FOUND(sourceVideoKey)
          ) as ErrorWithCause;
          missingSourceError.cause = error;
          throw missingSourceError;
        }
        await wait(DOWNLOAD_RETRY_INTERVAL_MS);
        continue;
      }

      const message = error instanceof Error ? error.message : String(error);
      const downloadError = new Error(
        `${ERROR_MESSAGES.DOWNLOAD_FAILED}: ${message}`
      ) as ErrorWithCause;
      downloadError.cause = error;
      throw downloadError;
    }
  }
};

const persistHighlights = async (
  jobId: string,
  highlights: Highlight[],
  tableName: string,
  awsRegion: string
): Promise<void> => {
  const docClient = createDynamoDBDocumentClient(awsRegion);
  const repo = new DynamoDBHighlightRepository(docClient, tableName);
  await repo.createMany(
    highlights.map((highlight) => ({
      ...highlight,
      jobId,
      status: 'pending',
      clipStatus: 'PENDING',
    }))
  );
};

const buildHighlights = async (jobId: string, localPath: string): Promise<Highlight[]> => {
  const analyzer = new FfmpegVideoAnalyzer();
  const motionService = new MotionHighlightService(analyzer);
  const volumeService = new VolumeHighlightService(analyzer);
  const duration = await analyzer.getDurationSec(localPath);
  const [motionScores, volumeScores] = await Promise.all([
    motionService.analyzeMotion(localPath),
    volumeService.analyzeVolume(localPath),
  ]);
  const aggregationService = new HighlightAggregationService();
  const extracted = aggregationService.aggregate(motionScores, volumeScores, duration);
  const sortedByStartSec = extracted.slice().sort((a, b) => a.startSec - b.startSec);
  return sortedByStartSec.map((item, index) => ({
    highlightId: randomUUID(),
    jobId,
    order: index + 1,
    startSec: item.startSec,
    endSec: item.endSec,
    source: item.source,
    status: 'pending',
    clipStatus: 'PENDING',
  }));
};

const updateJobStatus = async (
  jobId: string,
  status: JobStatus,
  tableName: string,
  awsRegion: string,
  errorMessage?: string
): Promise<void> => {
  const docClient = createDynamoDBDocumentClient(awsRegion);
  const jobRepo = new DynamoDBJobRepository(docClient, tableName);
  const service = new JobService(jobRepo);
  await service.updateStatus(jobId, status, errorMessage);
};

const runExtract = async (env: QuickClipBatchRunInput): Promise<void> => {
  const localVideoPath = VIDEO_INPUT_PATH(env.jobId);

  await updateJobStatus(env.jobId, 'PROCESSING', env.tableName, env.awsRegion);
  await downloadSourceVideo(env.bucketName, env.jobId, localVideoPath, env.awsRegion);
  const highlights = await buildHighlights(env.jobId, localVideoPath);
  await persistHighlights(env.jobId, highlights, env.tableName, env.awsRegion);
  await updateJobStatus(env.jobId, 'COMPLETED', env.tableName, env.awsRegion);
};

export const runQuickClipBatch = async (env: QuickClipBatchRunInput): Promise<void> => {
  try {
    await runExtract(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateJobStatus(env.jobId, 'FAILED', env.tableName, env.awsRegion, message);
    throw error;
  }
};
