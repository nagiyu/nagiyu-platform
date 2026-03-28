import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  HighlightAggregationService,
  JobService,
  type Highlight,
  type JobStatus,
} from '@nagiyu/quick-clip-core';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { type EnvironmentVariables, validateEnvironment } from './lib/environment.js';
import { FfmpegClipSplitter } from './libs/ffmpeg-clip-splitter.js';
import { FfmpegVideoAnalyzer } from './libs/ffmpeg-video-analyzer.js';
import { MotionHighlightService } from './libs/motion-highlight.service.js';
import { VolumeHighlightService } from './libs/volume-highlight.service.js';
import { DynamoDBHighlightRepository } from './repositories/dynamodb-highlight.repository.js';
import { DynamoDBJobRepository } from './repositories/dynamodb-job.repository.js';

const ERROR_MESSAGES = {
  JOB_NOT_FOUND: 'ジョブが見つかりません',
  JOB_NOT_COMPLETED: 'ジョブの処理が完了していません',
  DOWNLOAD_FAILED: '動画ファイルのダウンロードに失敗しました',
  UPLOAD_FAILED: 'クリップのアップロードに失敗しました',
} as const;

const VIDEO_INPUT_PATH = (jobId: string): string => `/tmp/quick-clip/${jobId}/input.mp4`;
const ZIP_OUTPUT_PATH = (jobId: string): string => `/tmp/quick-clip/${jobId}/clips.zip`;
const SOURCE_VIDEO_KEY = (jobId: string): string => `uploads/${jobId}/input.mp4`;
const CLIP_OUTPUT_KEY = (jobId: string, highlightId: string): string =>
  `outputs/${jobId}/clips/${highlightId}.mp4`;
const ZIP_OUTPUT_KEY = (jobId: string): string => `outputs/${jobId}/clips.zip`;

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
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: SOURCE_VIDEO_KEY(jobId),
    })
  );

  if (!response.Body) {
    throw new Error(ERROR_MESSAGES.DOWNLOAD_FAILED);
  }

  await mkdir(dirname(localPath), { recursive: true });
  const bytes = await response.Body.transformToByteArray();
  await writeFile(localPath, Buffer.from(bytes));
};

const uploadFile = async (
  bucketName: string,
  key: string,
  localPath: string,
  awsRegion: string
): Promise<void> => {
  try {
    const s3Client = new S3Client({ region: awsRegion });
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: createReadStream(localPath),
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${ERROR_MESSAGES.UPLOAD_FAILED}: ${message}`);
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
    highlights.map((highlight, index) => ({
      ...highlight,
      jobId,
      order: index + 1,
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

const runExtract = async (env: EnvironmentVariables): Promise<void> => {
  const localVideoPath = VIDEO_INPUT_PATH(env.jobId);

  await updateJobStatus(env.jobId, 'PROCESSING', env.tableName, env.awsRegion);
  await downloadSourceVideo(env.bucketName, env.jobId, localVideoPath, env.awsRegion);
  const highlights = await buildHighlights(env.jobId, localVideoPath);
  await persistHighlights(env.jobId, highlights, env.tableName, env.awsRegion);
  await updateJobStatus(env.jobId, 'COMPLETED', env.tableName, env.awsRegion);
};

const runSplit = async (env: EnvironmentVariables): Promise<void> => {
  const localVideoPath = VIDEO_INPUT_PATH(env.jobId);
  const zipPath = ZIP_OUTPUT_PATH(env.jobId);

  await ensureCompletedJob(env.jobId, env.tableName, env.awsRegion);
  await downloadSourceVideo(env.bucketName, env.jobId, localVideoPath, env.awsRegion);

  const docClient = createDynamoDBDocumentClient(env.awsRegion);
  const highlightRepo = new DynamoDBHighlightRepository(docClient, env.tableName);
  const highlights = await highlightRepo.getByJobId(env.jobId);

  const splitter = new FfmpegClipSplitter();
  const clipPaths = await splitter.splitClips(env.jobId, localVideoPath, highlights);
  for (const highlight of highlights.filter((item) => item.status === 'accepted')) {
    const clipPath = clipPaths.find((path) => path.endsWith(`${highlight.highlightId}.mp4`));
    if (!clipPath) {
      continue;
    }
    await uploadFile(
      env.bucketName,
      CLIP_OUTPUT_KEY(env.jobId, highlight.highlightId),
      clipPath,
      env.awsRegion
    );
  }

  await createPseudoZip(clipPaths, zipPath);
  await uploadFile(env.bucketName, ZIP_OUTPUT_KEY(env.jobId), zipPath, env.awsRegion);
};

export const main = async (): Promise<void> => {
  const env = validateEnvironment();
  try {
    if (env.batchCommand === 'extract') {
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

if (process.env.NODE_ENV !== 'test') {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
