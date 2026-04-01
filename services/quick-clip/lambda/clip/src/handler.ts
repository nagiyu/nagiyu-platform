import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBHighlightRepository } from '@nagiyu/quick-clip-core';

const ERROR_MESSAGES = {
  MISSING_ENV: '必要な環境変数が設定されていません',
  INVALID_INPUT: '入力値が不正です',
  DOWNLOAD_FAILED: '動画ファイルのダウンロードに失敗しました',
  SPLIT_FAILED: 'クリップ分割に失敗しました',
} as const;

const SOURCE_VIDEO_KEY = (jobId: string): string => `uploads/${jobId}/input.mp4`;
const CLIP_OUTPUT_KEY = (jobId: string, highlightId: string): string =>
  `outputs/${jobId}/clips/${highlightId}.mp4`;
const VIDEO_INPUT_PATH = (jobId: string, requestId: string): string =>
  `/tmp/quick-clip/clip/${requestId}/${jobId}/input.mp4`;
const CLIP_OUTPUT_PATH = (jobId: string, highlightId: string, requestId: string): string =>
  `/tmp/quick-clip/clip/${requestId}/${jobId}/${highlightId}.mp4`;

export type ClipRegenerateEvent = {
  jobId: string;
  highlightId: string;
  startSec: number;
  endSec: number;
};

export type ClipRegenerateResult = {
  clipStatus: 'GENERATED' | 'FAILED';
};

const createDynamoDBDocumentClient = (region: string): DynamoDBDocumentClient =>
  DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });

const validateEvent = (event: ClipRegenerateEvent): void => {
  if (!event.jobId || !event.highlightId) {
    throw new Error(ERROR_MESSAGES.INVALID_INPUT);
  }
  if (typeof event.startSec !== 'number' || typeof event.endSec !== 'number') {
    throw new Error(ERROR_MESSAGES.INVALID_INPUT);
  }
  if (event.startSec < 0 || event.endSec <= event.startSec) {
    throw new Error(ERROR_MESSAGES.INVALID_INPUT);
  }
};

const validateEnvironment = (): { tableName: string; bucketName: string; awsRegion: string } => {
  const tableName = process.env.DYNAMODB_TABLE_NAME?.trim() ?? '';
  const bucketName = process.env.S3_BUCKET?.trim() ?? '';
  const awsRegion = process.env.AWS_REGION?.trim() ?? '';
  const missing: string[] = [];
  if (tableName.length === 0) {
    missing.push('DYNAMODB_TABLE_NAME');
  }
  if (bucketName.length === 0) {
    missing.push('S3_BUCKET');
  }
  if (awsRegion.length === 0) {
    missing.push('AWS_REGION');
  }
  if (missing.length > 0) {
    throw new Error(`${ERROR_MESSAGES.MISSING_ENV}: ${missing.join(', ')}`);
  }
  return { tableName, bucketName, awsRegion };
};

const downloadSourceVideo = async (
  s3Client: S3Client,
  bucketName: string,
  jobId: string,
  localPath: string
): Promise<void> => {
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
  const fileStream = createWriteStream(localPath);
  await pipeline(response.Body as NodeJS.ReadableStream, fileStream);
};

const splitClip = async (
  inputPath: string,
  outputPath: string,
  startSec: number,
  endSec: number
): Promise<void> => {
  const duration = endSec - startSec;
  await mkdir(dirname(outputPath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-ss',
      String(startSec),
      '-t',
      String(duration),
      '-i',
      inputPath,
      '-c',
      'copy',
      '-y',
      outputPath,
    ]);
    let stderr = '';
    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    ffmpeg.on('error', (error) => {
      reject(new Error(`${ERROR_MESSAGES.SPLIT_FAILED}: ${error.message}`));
    });
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${ERROR_MESSAGES.SPLIT_FAILED}: exit code ${code}, stderr: ${stderr}`));
    });
  });
};

const uploadClip = async (
  s3Client: S3Client,
  bucketName: string,
  jobId: string,
  highlightId: string,
  outputPath: string
): Promise<void> => {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: CLIP_OUTPUT_KEY(jobId, highlightId),
      Body: createReadStream(outputPath),
    })
  );
};

const updateClipStatus = async (
  docClient: DynamoDBDocumentClient,
  tableName: string,
  event: ClipRegenerateEvent,
  clipStatus: 'GENERATED' | 'FAILED'
): Promise<void> => {
  const repository = new DynamoDBHighlightRepository(docClient, tableName);
  await repository.update(event.jobId, event.highlightId, {
    clipStatus,
  });
};

export const handler = async (event: ClipRegenerateEvent): Promise<ClipRegenerateResult> => {
  validateEvent(event);
  const { tableName, bucketName, awsRegion } = validateEnvironment();
  // Lambda の /tmp は実行環境内で共有され得るため、衝突回避のために一意な作業ディレクトリを使う。
  const requestId = randomUUID();
  const localInputPath = VIDEO_INPUT_PATH(event.jobId, requestId);
  const localOutputPath = CLIP_OUTPUT_PATH(event.jobId, event.highlightId, requestId);
  const s3Client = new S3Client({ region: awsRegion });
  const docClient = createDynamoDBDocumentClient(awsRegion);

  try {
    await downloadSourceVideo(s3Client, bucketName, event.jobId, localInputPath);
    await splitClip(localInputPath, localOutputPath, event.startSec, event.endSec);
    await uploadClip(s3Client, bucketName, event.jobId, event.highlightId, localOutputPath);
    await updateClipStatus(docClient, tableName, event, 'GENERATED');
    return { clipStatus: 'GENERATED' };
  } catch (error) {
    await updateClipStatus(docClient, tableName, event, 'FAILED');
    throw error;
  } finally {
    await rm(dirname(localInputPath), { recursive: true, force: true });
  }
};
