import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { spawn } from 'child_process';
import { createWriteStream, createReadStream, promises as fs } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import type { CodecType } from '@nagiyu-platform/codec-converter-common';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  MISSING_ENV: '必要な環境変数が設定されていません',
  INVALID_JOB_ID: 'ジョブIDが不正です',
  INVALID_OUTPUT_CODEC: '出力コーデックが不正です',
  S3_DOWNLOAD_FAILED: 'S3からのダウンロードに失敗しました',
  S3_UPLOAD_FAILED: 'S3へのアップロードに失敗しました',
  DYNAMODB_UPDATE_FAILED: 'DynamoDBの更新に失敗しました',
  FFMPEG_EXECUTION_FAILED: 'FFmpegの実行に失敗しました',
  CLEANUP_FAILED: '一時ファイルのクリーンアップに失敗しました',
} as const;

// 環境変数の型定義
interface EnvironmentVariables {
  S3_BUCKET: string;
  DYNAMODB_TABLE: string;
  AWS_REGION: string;
  JOB_ID: string;
  OUTPUT_CODEC: CodecType;
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
 */
export function validateEnvironment(): EnvironmentVariables {
  const required = ['S3_BUCKET', 'DYNAMODB_TABLE', 'AWS_REGION', 'JOB_ID', 'OUTPUT_CODEC'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`${ERROR_MESSAGES.MISSING_ENV}: ${missing.join(', ')}`);
  }

  const outputCodec = process.env.OUTPUT_CODEC as CodecType;
  if (!['h264', 'vp9', 'av1'].includes(outputCodec)) {
    throw new Error(ERROR_MESSAGES.INVALID_OUTPUT_CODEC);
  }

  return {
    S3_BUCKET: process.env.S3_BUCKET!,
    DYNAMODB_TABLE: process.env.DYNAMODB_TABLE!,
    AWS_REGION: process.env.AWS_REGION!,
    JOB_ID: process.env.JOB_ID!,
    OUTPUT_CODEC: outputCodec,
  };
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
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${ERROR_MESSAGES.S3_DOWNLOAD_FAILED}: ${message}`);
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
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${ERROR_MESSAGES.S3_UPLOAD_FAILED}: ${message}`);
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
    const now = Math.floor(Date.now() / 1000);
    const updateExpression = outputFile
      ? 'SET #status = :status, #updatedAt = :updatedAt, #outputFile = :outputFile'
      : errorMessage
        ? 'SET #status = :status, #updatedAt = :updatedAt, #errorMessage = :errorMessage'
        : 'SET #status = :status, #updatedAt = :updatedAt';

    const expressionAttributeValues: Record<string, string | number> = {
      ':status': status,
      ':updatedAt': now,
    };

    if (outputFile) {
      expressionAttributeValues[':outputFile'] = outputFile;
    }
    if (errorMessage) {
      expressionAttributeValues[':errorMessage'] = errorMessage;
    }

    const command = new UpdateCommand({
      TableName: tableName,
      Key: { jobId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
        ...(outputFile && { '#outputFile': 'outputFile' }),
        ...(errorMessage && { '#errorMessage': 'errorMessage' }),
      },
      ExpressionAttributeValues: expressionAttributeValues,
    });

    await dynamodbClient.send(command);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${ERROR_MESSAGES.DYNAMODB_UPDATE_FAILED}: ${message}`);
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
      stderr += chunk;
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
      reject(new Error(`${ERROR_MESSAGES.FFMPEG_EXECUTION_FAILED}: ${error.message}`));
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
        const message = error instanceof Error ? error.message : String(error);
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

  try {
    // ステータスをPROCESSINGに更新
    await updateJobStatus(dynamodbClient, env.DYNAMODB_TABLE, env.JOB_ID, 'PROCESSING');

    // S3から入力ファイルをダウンロード
    await downloadFromS3(s3Client, env.S3_BUCKET, inputKey, inputPath);

    // FFmpegで変換
    await convertWithFFmpeg(inputPath, outputPath, env.OUTPUT_CODEC);

    // S3に出力ファイルをアップロード
    await uploadToS3(s3Client, env.S3_BUCKET, outputKey, outputPath);

    // ステータスをCOMPLETEDに更新
    await updateJobStatus(dynamodbClient, env.DYNAMODB_TABLE, env.JOB_ID, 'COMPLETED', outputKey);

    // 一時ファイルをクリーンアップ
    await cleanup([inputPath, outputPath]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Job ${env.JOB_ID} failed:`, errorMessage);

    // ステータスをFAILEDに更新
    try {
      await updateJobStatus(
        dynamodbClient,
        env.DYNAMODB_TABLE,
        env.JOB_ID,
        'FAILED',
        undefined,
        errorMessage
      );
    } catch (updateError) {
      console.error('Failed to update job status to FAILED:', updateError);
    }

    // クリーンアップを試みる（エラーは無視）
    try {
      await cleanup([inputPath, outputPath]);
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError);
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

  const s3Client = new S3Client({ region: env.AWS_REGION });
  const dynamodbClient = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: env.AWS_REGION })
  );

  await processJob(env, s3Client, dynamodbClient);
  console.log(`Job ${env.JOB_ID} completed successfully`);
}

// スクリプトとして実行された場合のみmain()を呼び出す
// テスト環境（NODE_ENV === 'test'）では実行しない
const isMainModule = process.env.NODE_ENV !== 'test';
if (isMainModule) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
