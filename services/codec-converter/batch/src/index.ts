import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { spawn } from 'child_process';
import { createWriteStream, createReadStream, promises as fs } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import {
  createJobRepository,
  readBatchJobInput,
  type CodecType,
} from '@nagiyu/codec-converter-core';
import {
  createErrorReporter,
  withErrorReporting,
  getDynamoDBDocumentClient,
  getS3Client,
} from '@nagiyu/aws';
import { requireEnv, toErrorMessage } from '@nagiyu/common';

const errorReporter = createErrorReporter({ serviceId: 'codec-converter' });

// エラーメッセージ定数
const ERROR_MESSAGES = {
  INVALID_JOB_ID: 'ジョブIDが不正です',
  S3_DOWNLOAD_FAILED: 'S3からのダウンロードに失敗しました',
  S3_UPLOAD_FAILED: 'S3へのアップロードに失敗しました',
  DYNAMODB_UPDATE_FAILED: 'DynamoDBの更新に失敗しました',
  FFMPEG_EXECUTION_FAILED: 'FFmpegの実行に失敗しました',
  CLEANUP_FAILED: '一時ファイルのクリーンアップに失敗しました',
} as const;

/**
 * ジョブの errorMessage に保存する利用者向けの文言。
 * 終了コード・stderr・S3 のエラー文などの技術的な内容は、画面と API 応答に出さないため含めない。
 * 詳細はログと Admin へのエラー報告に残す。
 */
export const USER_ERROR_MESSAGES = {
  DOWNLOAD_FAILED: '動画ファイルの取得に失敗しました。しばらくしてからもう一度お試しください',
  CONVERT_FAILED:
    '動画の変換に失敗しました。ファイルが壊れているか、対応していない形式の可能性があります',
  UPLOAD_FAILED: '変換後のファイルの保存に失敗しました。しばらくしてからもう一度お試しください',
  UNKNOWN: '変換中にエラーが発生しました。しばらくしてからもう一度お試しください',
} as const;

/** FFmpeg の stderr として保持する末尾の最大文字数。失敗理由は末尾に出るため末尾を残す */
export const FFMPEG_STDERR_MAX_LENGTH = 4000;

/**
 * FFmpeg を起動できなかったときの例外。
 * 動画の問題ではなく実行環境の問題なので、変換失敗とは別の利用者向け文言にするために区別する
 */
export class FFmpegSpawnError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'FFmpegSpawnError';
  }
}

// 環境変数の型定義
interface EnvironmentVariables {
  S3_BUCKET: string;
  DYNAMODB_TABLE_NAME: string;
  AWS_REGION: string;
  JOB_ID: string;
  OUTPUT_CODEC: CodecType;
  JOB_DEFINITION_NAME?: string;
}

// ECS タスクメタデータの型定義
interface ECSMetadata {
  Limits?: {
    CPU?: number;
    Memory?: number;
  };
  [key: string]: unknown;
}

// FFmpegのコーデックパラメータ
const CODEC_PARAMS: Record<
  CodecType,
  { videoCodec: string; audioCodec: string; container: string; params: string[] }
> = {
  h264: {
    videoCodec: 'libx264',
    audioCodec: 'aac',
    container: 'mp4',
    params: ['-crf', '23'],
  },
  vp9: {
    videoCodec: 'libvpx-vp9',
    audioCodec: 'libopus',
    container: 'webm',
    params: ['-crf', '30'],
  },
  av1: {
    videoCodec: 'libaom-av1',
    audioCodec: 'libopus',
    container: 'webm',
    params: ['-crf', '30', '-cpu-used', '4'],
  },
};

/**
 * 環境変数を検証して取得する
 *
 * 起動ごとの入力 (JOB_ID / OUTPUT_CODEC) は web と共有する定義で読み、
 * テーブル名などジョブ定義が持つ値は別に必須チェックする。
 */
export function validateEnvironment(): EnvironmentVariables {
  const { jobId, outputCodec } = readBatchJobInput(process.env);
  const env = requireEnv(['S3_BUCKET', 'DYNAMODB_TABLE_NAME', 'AWS_REGION']);

  return {
    S3_BUCKET: env.S3_BUCKET,
    DYNAMODB_TABLE_NAME: env.DYNAMODB_TABLE_NAME,
    AWS_REGION: env.AWS_REGION,
    JOB_ID: jobId,
    OUTPUT_CODEC: outputCodec,
    JOB_DEFINITION_NAME: process.env.JOB_DEFINITION_NAME,
  };
}

/**
 * ECS タスクメタデータエンドポイントから情報を取得
 * https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-metadata-endpoint.html
 */
export async function getECSMetadata(): Promise<ECSMetadata> {
  const metadataUri = process.env.ECS_CONTAINER_METADATA_URI_V4;
  if (!metadataUri) {
    return {};
  }

  try {
    const response = await fetch(`${metadataUri}/task`);
    return (await response.json()) as ECSMetadata;
  } catch (error) {
    console.warn('Failed to fetch ECS metadata:', error);
    return {};
  }
}

/**
 * S3からファイルをダウンロードする
 */
export async function downloadFromS3(
  s3Client: S3Client,
  bucket: string,
  key: string,
  localPath: string
): Promise<void> {
  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error('S3レスポンスのBodyが空です');
    }

    const readableStream = response.Body as Readable;
    const writeStream = createWriteStream(localPath);
    await pipeline(readableStream, writeStream);
  } catch (error) {
    const message = toErrorMessage(error);
    throw new Error(`${ERROR_MESSAGES.S3_DOWNLOAD_FAILED}: ${message}`, { cause: error });
  }
}

/**
 * S3にファイルをアップロードする
 */
export async function uploadToS3(
  s3Client: S3Client,
  bucket: string,
  key: string,
  localPath: string
): Promise<void> {
  try {
    const fileStream = createReadStream(localPath);
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileStream,
    });
    await s3Client.send(command);
  } catch (error) {
    const message = toErrorMessage(error);
    throw new Error(`${ERROR_MESSAGES.S3_UPLOAD_FAILED}: ${message}`, { cause: error });
  }
}

/**
 * DynamoDBのジョブステータスを更新する
 */
export async function updateJobStatus(
  dynamodbClient: DynamoDBDocumentClient,
  tableName: string,
  jobId: string,
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED',
  outputFile?: string,
  errorMessage?: string
): Promise<void> {
  try {
    // 空文字は未指定として扱い、保存しない
    await createJobRepository(dynamodbClient, tableName).updateStatus(jobId, {
      status,
      outputFile: outputFile || undefined,
      errorMessage: errorMessage || undefined,
    });
  } catch (error) {
    const message = toErrorMessage(error);
    throw new Error(`${ERROR_MESSAGES.DYNAMODB_UPDATE_FAILED}: ${message}`, { cause: error });
  }
}

/**
 * FFmpegで動画を変換する
 */
export async function convertWithFFmpeg(
  inputPath: string,
  outputPath: string,
  codec: CodecType
): Promise<void> {
  const codecConfig = CODEC_PARAMS[codec];

  const args = [
    '-i',
    inputPath,
    '-c:v',
    codecConfig.videoCodec,
    '-c:a',
    codecConfig.audioCodec,
    ...codecConfig.params,
    '-y', // 出力ファイルを上書き
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);
    let stderr = '';
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let stdout = '';

    ffmpeg.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffmpeg.stderr.on('data', (data) => {
      const chunk = data.toString();
      // 長時間の変換で際限なく溜まらないよう、追記のたびに末尾だけ残す
      stderr = (stderr + chunk).slice(-FFMPEG_STDERR_MAX_LENGTH);
      // FFmpeg の進捗情報は stderr に出力されるため、ここから time= を解析する
      if (chunk.includes('time=')) {
        const timeMatch = chunk.match(/time=(\S+)/);
        if (timeMatch) {
          console.log(`FFmpeg progress: ${timeMatch[1]}`);
        }
      }
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${ERROR_MESSAGES.FFMPEG_EXECUTION_FAILED}: exit code ${code}, stderr: ${stderr}`
          )
        );
      }
    });

    ffmpeg.on('error', (error) => {
      reject(
        new FFmpegSpawnError(`${ERROR_MESSAGES.FFMPEG_EXECUTION_FAILED}: ${error.message}`, {
          cause: error,
        })
      );
    });
  });
}

/**
 * 一時ファイルをクリーンアップする
 */
export async function cleanup(paths: string[]): Promise<void> {
  const errors: string[] = [];

  for (const path of paths) {
    try {
      await fs.unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        const message = toErrorMessage(error);
        errors.push(`${path}: ${message}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`${ERROR_MESSAGES.CLEANUP_FAILED}: ${errors.join(', ')}`);
  }
}

/**
 * ジョブ処理のメイン関数
 */
export async function processJob(
  env: EnvironmentVariables,
  s3Client: S3Client,
  dynamodbClient: DynamoDBDocumentClient
): Promise<void> {
  const inputKey = `uploads/${env.JOB_ID}/input.mp4`;
  const outputKey = `outputs/${env.JOB_ID}/output.${CODEC_PARAMS[env.OUTPUT_CODEC].container}`;
  const inputPath = `/tmp/input-${env.JOB_ID}.mp4`;
  const outputPath = `/tmp/output-${env.JOB_ID}.${CODEC_PARAMS[env.OUTPUT_CODEC].container}`;

  // 失敗した段に応じて、利用者向けの文言を選ぶために現在の段を持つ
  let userErrorMessage: string = USER_ERROR_MESSAGES.UNKNOWN;

  try {
    // ステータスをPROCESSINGに更新
    await updateJobStatus(dynamodbClient, env.DYNAMODB_TABLE_NAME, env.JOB_ID, 'PROCESSING');

    // S3から入力ファイルをダウンロード
    userErrorMessage = USER_ERROR_MESSAGES.DOWNLOAD_FAILED;
    await downloadFromS3(s3Client, env.S3_BUCKET, inputKey, inputPath);

    // FFmpegで変換
    userErrorMessage = USER_ERROR_MESSAGES.CONVERT_FAILED;
    await convertWithFFmpeg(inputPath, outputPath, env.OUTPUT_CODEC);

    // S3に出力ファイルをアップロード
    userErrorMessage = USER_ERROR_MESSAGES.UPLOAD_FAILED;
    await uploadToS3(s3Client, env.S3_BUCKET, outputKey, outputPath);

    // ステータスをCOMPLETEDに更新
    userErrorMessage = USER_ERROR_MESSAGES.UNKNOWN;
    await updateJobStatus(
      dynamodbClient,
      env.DYNAMODB_TABLE_NAME,
      env.JOB_ID,
      'COMPLETED',
      outputKey
    );

    // 一時ファイルをクリーンアップ
    await cleanup([inputPath, outputPath]);
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    console.error(`Job ${env.JOB_ID} failed:`, errorMessage);
    await errorReporter.report('Batchジョブが失敗しました', error, {
      severity: 'critical',
      context: { jobId: env.JOB_ID, outputCodec: env.OUTPUT_CODEC },
    });

    // ステータスをFAILEDに更新
    try {
      await updateJobStatus(
        dynamodbClient,
        env.DYNAMODB_TABLE_NAME,
        env.JOB_ID,
        'FAILED',
        undefined,
        error instanceof FFmpegSpawnError ? USER_ERROR_MESSAGES.UNKNOWN : userErrorMessage
      );
    } catch (updateError) {
      console.error('Failed to update job status to FAILED:', updateError);
      await errorReporter.report('ジョブステータスのFAILD更新に失敗しました', updateError, {
        context: { jobId: env.JOB_ID, originalError: errorMessage },
      });
    }

    // クリーンアップを試みる（エラーは無視）
    try {
      await cleanup([inputPath, outputPath]);
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError);
      await errorReporter.report('一時ファイルのクリーンアップに失敗しました', cleanupError, {
        severity: 'warning',
        context: { jobId: env.JOB_ID },
      });
    }

    throw error;
  }
}

/**
 * メイン実行関数
 * AWS Batch がリトライを管理するため、この関数ではリトライを行わない
 */
export async function main(): Promise<void> {
  const env = validateEnvironment();

  // 使用リソース情報をログ出力
  const jobDefinitionName = env.JOB_DEFINITION_NAME || 'unknown';
  const ecsMetadata = await getECSMetadata();
  const limits = ecsMetadata.Limits || {};

  console.log('Batch Worker started', {
    jobId: env.JOB_ID,
    outputCodec: env.OUTPUT_CODEC,
    jobDefinitionName,
    resources: {
      cpu: limits.CPU || 'unknown',
      memory: limits.Memory || 'unknown',
    },
  });

  const s3Client = getS3Client(env.AWS_REGION);
  const dynamodbClient = getDynamoDBDocumentClient(env.AWS_REGION);

  await processJob(env, s3Client, dynamodbClient);
  console.log(`Job ${env.JOB_ID} completed successfully`);
}

withErrorReporting(
  {
    serviceId: 'codec-converter',
    severity: 'critical',
    title: 'コーデック変換バッチが起動時に失敗しました',
    exitOnError: true,
    runIfNotTest: true,
  },
  main
);
