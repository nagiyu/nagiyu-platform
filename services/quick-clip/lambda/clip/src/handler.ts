import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { withErrorReporting, getDynamoDBDocumentClient, getS3Client } from '@nagiyu/aws';
import { requireEnv } from '@nagiyu/common';
import { DynamoDBHighlightRepository } from '@nagiyu/quick-clip-core';

const ERROR_MESSAGES = {
  INVALID_INPUT: '入力値が不正です',
  SPLIT_FAILED: 'クリップ分割に失敗しました',
} as const;

const SOURCE_VIDEO_KEY = (jobId: string): string => `uploads/${jobId}/input.mp4`;
const CLIP_OUTPUT_KEY = (jobId: string, highlightId: string): string =>
  `outputs/${jobId}/clips/${highlightId}.mp4`;
const CLIP_OUTPUT_PATH = (jobId: string, highlightId: string, requestId: string): string =>
  `/tmp/quick-clip/clip/${requestId}/${jobId}/${highlightId}.mp4`;
const PRESIGNED_URL_EXPIRATION_SECONDS = 3600;

export type ClipRegenerateEvent = {
  jobId: string;
  highlightId: string;
  startSec: number;
  endSec: number;
};

export type ClipRegenerateResult = {
  clipStatus: 'GENERATED' | 'FAILED';
};

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
  const env = requireEnv(['DYNAMODB_TABLE_NAME', 'S3_BUCKET', 'AWS_REGION']);
  return {
    tableName: env.DYNAMODB_TABLE_NAME,
    bucketName: env.S3_BUCKET,
    awsRegion: env.AWS_REGION,
  };
};

const createSourceVideoUrl = async (
  s3Client: S3Client,
  bucketName: string,
  jobId: string
): Promise<string> =>
  getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: SOURCE_VIDEO_KEY(jobId),
    }),
    { expiresIn: PRESIGNED_URL_EXPIRATION_SECONDS }
  );

const splitClip = async (
  sourceVideoUrl: string,
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
      sourceVideoUrl,
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
  const localOutputPath = CLIP_OUTPUT_PATH(event.jobId, event.highlightId, requestId);
  const s3Client = getS3Client(awsRegion);
  const docClient = getDynamoDBDocumentClient(awsRegion);

  try {
    const result = await withErrorReporting(
      {
        serviceId: 'quick-clip',
        severity: 'error',
        title: 'QuickClip クリップ再生成に失敗しました',
        context: {
          jobId: event.jobId,
          highlightId: event.highlightId,
          s3Key: CLIP_OUTPUT_KEY(event.jobId, event.highlightId),
        },
        onError: async () => {
          await updateClipStatus(docClient, tableName, event, 'FAILED');
        },
      },
      async () => {
        const inputSourceUrl = await createSourceVideoUrl(s3Client, bucketName, event.jobId);
        await splitClip(inputSourceUrl, localOutputPath, event.startSec, event.endSec);
        await uploadClip(s3Client, bucketName, event.jobId, event.highlightId, localOutputPath);
        await updateClipStatus(docClient, tableName, event, 'GENERATED');
        return { clipStatus: 'GENERATED' as const };
      }
    );
    return result!;
  } finally {
    await rm(dirname(localOutputPath), { recursive: true, force: true });
  }
};
