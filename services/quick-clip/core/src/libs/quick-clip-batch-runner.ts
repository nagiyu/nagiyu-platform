import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { HighlightAggregationService } from './highlight-aggregation.service.js';
import { JobService } from './job.service.js';
import type { Highlight, JobStatus } from '../types.js';
import { FfmpegClipSplitter } from './ffmpeg-clip-splitter.js';
import { FfmpegVideoAnalyzer } from './ffmpeg-video-analyzer.js';
import { MotionHighlightService } from './motion-highlight.service.js';
import { VolumeHighlightService } from './volume-highlight.service.js';
import { DynamoDBHighlightRepository } from '../repositories/dynamodb-highlight.repository.js';
import { DynamoDBJobRepository } from '../repositories/dynamodb-job.repository.js';

/** Batch 実行コマンド種別。 */
export type QuickClipBatchCommand = 'extract' | 'split';

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
  JOB_NOT_FOUND: 'ジョブが見つかりません',
  JOB_NOT_COMPLETED: 'ジョブの処理が完了していません',
  DOWNLOAD_FAILED: '動画ファイルのダウンロードに失敗しました',
  SOURCE_VIDEO_NOT_FOUND: (sourceVideoKey: string): string =>
    `アップロード済みの動画ファイルが見つかりません: ${sourceVideoKey}`,
} as const;

const VIDEO_INPUT_PATH = (jobId: string): string => `/tmp/quick-clip/${jobId}/input.mp4`;
const ZIP_OUTPUT_PATH = (jobId: string): string => `/tmp/quick-clip/${jobId}/clips.zip`;
const SOURCE_VIDEO_KEY = (jobId: string): string => `uploads/${jobId}/input.mp4`;
const CLIP_OUTPUT_KEY = (jobId: string, highlightId: string): string =>
  `outputs/${jobId}/clips/${highlightId}.mp4`;
const ZIP_OUTPUT_KEY = (jobId: string): string => `outputs/${jobId}/clips.zip`;
const DOWNLOAD_RETRY_COUNT = 20;
const DOWNLOAD_RETRY_INTERVAL_MS = 3000;

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
      const bytes = await response.Body.transformToByteArray();
      await writeFile(localPath, Buffer.from(bytes));
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

const uploadFile = async (
  bucketName: string,
  key: string,
  localPath: string,
  awsRegion: string
): Promise<void> => {
  const s3Client = new S3Client({ region: awsRegion });
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: createReadStream(localPath),
    })
  );
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
    }))
  );
};

const buildHighlights = async (jobId: string, localPath: string): Promise<Highlight[]> => {
  const analyzer = new FfmpegVideoAnalyzer();
  const aggregationService = new HighlightAggregationService([
    new MotionHighlightService(analyzer),
    new VolumeHighlightService(analyzer),
  ]);
  const extracted = await aggregationService.aggregate(jobId, localPath);
  return extracted.map((item, index) => ({
    highlightId: randomUUID(),
    jobId,
    order: index + 1,
    startSec: item.startSec,
    endSec: item.endSec,
    status: 'pending',
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

const createPseudoZip = async (files: string[], outputPath: string): Promise<void> => {
  // Phase 4 では ZIP 実装を簡易化し、クリップ一覧インデックスを保存する。
  // 実 ZIP 生成は Phase 5 以降で置き換える。
  const contentLines = ['quick-clip pseudo zip index'];
  for (const filePath of files) {
    contentLines.push(filePath);
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await rm(outputPath, { force: true });
  await writeFile(outputPath, contentLines.join('\n'));
};

const ensureCompletedJob = async (
  jobId: string,
  tableName: string,
  awsRegion: string
): Promise<void> => {
  const docClient = createDynamoDBDocumentClient(awsRegion);
  const jobRepo = new DynamoDBJobRepository(docClient, tableName);
  const service = new JobService(jobRepo);
  const job = await service.getJob(jobId);
  if (!job) {
    throw new Error(ERROR_MESSAGES.JOB_NOT_FOUND);
  }
  if (job.status !== 'COMPLETED') {
    throw new Error(ERROR_MESSAGES.JOB_NOT_COMPLETED);
  }
};

const runExtract = async (env: QuickClipBatchRunInput): Promise<void> => {
  const localVideoPath = VIDEO_INPUT_PATH(env.jobId);

  await updateJobStatus(env.jobId, 'PROCESSING', env.tableName, env.awsRegion);
  await downloadSourceVideo(env.bucketName, env.jobId, localVideoPath, env.awsRegion);
  const highlights = await buildHighlights(env.jobId, localVideoPath);
  await persistHighlights(env.jobId, highlights, env.tableName, env.awsRegion);
  await updateJobStatus(env.jobId, 'COMPLETED', env.tableName, env.awsRegion);
};

const runSplit = async (env: QuickClipBatchRunInput): Promise<void> => {
  const localVideoPath = VIDEO_INPUT_PATH(env.jobId);
  const zipPath = ZIP_OUTPUT_PATH(env.jobId);

  await ensureCompletedJob(env.jobId, env.tableName, env.awsRegion);
  await downloadSourceVideo(env.bucketName, env.jobId, localVideoPath, env.awsRegion);

  const docClient = createDynamoDBDocumentClient(env.awsRegion);
  const highlightRepo = new DynamoDBHighlightRepository(docClient, env.tableName);
  const highlights = await highlightRepo.getByJobId(env.jobId);

  const splitter = new FfmpegClipSplitter();
  const clipPaths = await splitter.splitClips(env.jobId, localVideoPath, highlights);
  await Promise.all(
    highlights
      .filter((item) => item.status === 'accepted')
      .map(async (highlight) => {
        const clipPath = clipPaths.find((path) => path.endsWith(`${highlight.highlightId}.mp4`));
        if (!clipPath) {
          return;
        }
        await uploadFile(
          env.bucketName,
          CLIP_OUTPUT_KEY(env.jobId, highlight.highlightId),
          clipPath,
          env.awsRegion
        );
      })
  );

  await createPseudoZip(clipPaths, zipPath);
  await uploadFile(env.bucketName, ZIP_OUTPUT_KEY(env.jobId), zipPath, env.awsRegion);
};

export const runQuickClipBatch = async (env: QuickClipBatchRunInput): Promise<void> => {
  try {
    if (env.command === 'extract') {
      await runExtract(env);
    } else {
      await runSplit(env);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateJobStatus(env.jobId, 'FAILED', env.tableName, env.awsRegion, message);
    throw error;
  }
};
