/**
 * Codec Converter Worker
 * AWS Batch で実行される動画変換ワーカー
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

// 環境変数の検証
function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

const JOB_ID = getRequiredEnv('JOB_ID');
const OUTPUT_CODEC = getRequiredEnv('OUTPUT_CODEC');
const S3_BUCKET = getRequiredEnv('S3_BUCKET');
const DYNAMODB_TABLE = getRequiredEnv('DYNAMODB_TABLE');
const AWS_REGION = getRequiredEnv('AWS_REGION');

// AWS クライアントの初期化
const s3Client = new S3Client({ region: AWS_REGION });
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }));

// 作業ディレクトリ（環境変数で変更可能）
const WORK_DIR = process.env.WORK_DIR || '/tmp/worker';

/**
 * DynamoDB のステータスを更新
 */
async function updateJobStatus(status: string, errorMessage?: string): Promise<void> {
  const updateExpression = errorMessage
    ? 'SET #status = :status, updatedAt = :updatedAt, errorMessage = :errorMessage'
    : 'SET #status = :status, updatedAt = :updatedAt';

  const expressionAttributeValues: Record<string, any> = {
    ':status': status,
    ':updatedAt': Date.now(),
  };

  if (errorMessage) {
    expressionAttributeValues[':errorMessage'] = errorMessage;
  }

  await dynamoClient.send(
    new UpdateCommand({
      TableName: DYNAMODB_TABLE,
      Key: { jobId: JOB_ID },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );

  console.log(`Status updated to: ${status}`);
}

/**
 * S3 から入力ファイルをダウンロード
 */
async function downloadInputFile(): Promise<string> {
  const inputKey = `uploads/${JOB_ID}/input.mp4`;
  const inputPath = path.join(WORK_DIR, 'input.mp4');

  console.log(`Downloading from S3: ${inputKey}`);

  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: inputKey,
  });

  const response = await s3Client.send(command);
  
  if (!response.Body) {
    throw new Error('No body in S3 response');
  }

  const fileStream = fs.createWriteStream(inputPath);
  const bodyStream = response.Body as Readable;

  await new Promise<void>((resolve, reject) => {
    bodyStream.on('error', reject);
    fileStream.on('error', reject);
    fileStream.on('finish', () => resolve());
    bodyStream.pipe(fileStream);
  });

  console.log(`Downloaded to: ${inputPath}`);
  return inputPath;
}

/**
 * FFmpeg で動画を変換
 */
async function convertVideo(inputPath: string): Promise<string> {
  const outputFileName = OUTPUT_CODEC === 'h264' ? 'output.mp4' : 'output.webm';
  const outputPath = path.join(WORK_DIR, outputFileName);

  // コーデックに応じた FFmpeg コマンドを構築
  let ffmpegArgs: string[];

  switch (OUTPUT_CODEC) {
    case 'h264':
      ffmpegArgs = [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        outputPath,
      ];
      break;
    case 'vp9':
      ffmpegArgs = [
        '-i', inputPath,
        '-c:v', 'libvpx-vp9',
        '-crf', '30',
        '-b:v', '0',
        '-c:a', 'libopus',
        '-b:a', '128k',
        outputPath,
      ];
      break;
    case 'av1':
      ffmpegArgs = [
        '-i', inputPath,
        '-c:v', 'libaom-av1',
        '-crf', '30',
        '-b:v', '0',
        '-cpu-used', '4',
        '-c:a', 'libopus',
        '-b:a', '128k',
        outputPath,
      ];
      break;
    default:
      throw new Error(`Unsupported codec: ${OUTPUT_CODEC}`);
  }

  console.log(`Running FFmpeg with codec: ${OUTPUT_CODEC}`);
  console.log(`FFmpeg args: ${ffmpegArgs.join(' ')}`);

  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);

    ffmpeg.stdout.on('data', (data) => {
      console.log(`FFmpeg stdout: ${data}`);
    });

    ffmpeg.stderr.on('data', (data) => {
      console.error(`FFmpeg stderr: ${data}`);
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log('FFmpeg conversion completed successfully');
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on('error', (error) => {
      reject(error);
    });
  });

  return outputPath;
}

/**
 * S3 に出力ファイルをアップロード
 */
async function uploadOutputFile(outputPath: string): Promise<string> {
  const ext = path.extname(outputPath);
  const outputKey = `outputs/${JOB_ID}/output${ext}`;

  console.log(`Uploading to S3: ${outputKey}`);

  const fileStream = fs.createReadStream(outputPath);
  const contentType = ext === '.mp4' ? 'video/mp4' : 'video/webm';

  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: outputKey,
      Body: fileStream,
      ContentType: contentType,
    })
  );

  console.log(`Uploaded to: ${outputKey}`);
  return outputKey;
}

/**
 * メイン処理
 */
async function main(): Promise<void> {
  console.log('=== Worker Process Starting ===');

  try {
    // 1. ステータスを PROCESSING に更新
    await updateJobStatus('PROCESSING');

    // 2. S3 から入力ファイルをダウンロード
    const inputPath = await downloadInputFile();

    // 3. FFmpeg で変換
    const outputPath = await convertVideo(inputPath);

    // 4. S3 へ出力ファイルをアップロード
    const outputKey = await uploadOutputFile(outputPath);

    // 5. ステータスを COMPLETED に更新
    await updateJobStatus('COMPLETED');

    console.log('=== Worker Process Completed Successfully ===');
    console.log(`Output file: s3://${S3_BUCKET}/${outputKey}`);

    process.exit(0);
  } catch (error) {
    console.error('=== Worker Process Failed ===');
    console.error(error);

    // ステータスを FAILED に更新
    const errorMessage = error instanceof Error ? error.message : String(error);
    await updateJobStatus('FAILED', errorMessage);

    process.exit(1);
  }
}

// プロセス起動
main();
