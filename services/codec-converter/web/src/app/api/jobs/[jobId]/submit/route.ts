import { NextRequest, NextResponse } from 'next/server';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { SubmitJobCommand } from '@aws-sdk/client-batch';
import { type Job, type JobStatus } from 'codec-converter-core';
import { getAwsClients } from '@/lib/aws-clients';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  JOB_NOT_FOUND: '指定されたジョブが見つかりません',
  INVALID_STATUS: 'ジョブは既に実行中または完了しています',
  FILE_NOT_FOUND: '入力ファイルが見つかりません',
  INTERNAL_SERVER_ERROR: 'ジョブの投入に失敗しました',
} as const;

/**
 * 環境変数を取得
 */
function getEnvVars() {
  return {
    DYNAMODB_TABLE: process.env.DYNAMODB_TABLE || '',
    S3_BUCKET: process.env.S3_BUCKET || '',
    BATCH_JOB_QUEUE: process.env.BATCH_JOB_QUEUE || '',
    BATCH_JOB_DEFINITION: process.env.BATCH_JOB_DEFINITION || '',
    AWS_REGION: process.env.AWS_REGION || 'us-east-1',
  };
}

/**
 * エラーレスポンスの型定義
 */
interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * 成功レスポンスの型定義
 */
interface SubmitJobResponse {
  jobId: string;
  status: JobStatus;
}

/**
 * POST /api/jobs/{jobId}/submit
 * アップロード完了後にAWS Batchジョブを投入
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<NextResponse<SubmitJobResponse | ErrorResponse>> {
  try {
    // パスパラメータの取得
    const { jobId } = await params;

    // AWS クライアントと環境変数の取得
    const { docClient, s3Client, batchClient } = getAwsClients();
    const { DYNAMODB_TABLE, S3_BUCKET, BATCH_JOB_QUEUE, BATCH_JOB_DEFINITION, AWS_REGION } =
      getEnvVars();

    // 1. DynamoDBでジョブの存在確認
    const getResult = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: { jobId },
      })
    );

    if (!getResult.Item) {
      return NextResponse.json(
        {
          error: 'JOB_NOT_FOUND',
          message: ERROR_MESSAGES.JOB_NOT_FOUND,
        },
        { status: 404 }
      );
    }

    const job = getResult.Item as Job;

    // 2. ジョブステータスの確認（PENDINGのみ許可）
    if (job.status !== 'PENDING') {
      return NextResponse.json(
        {
          error: 'INVALID_STATUS',
          message: ERROR_MESSAGES.INVALID_STATUS,
        },
        { status: 409 }
      );
    }

    // 3. S3で入力ファイルの存在確認
    try {
      await s3Client.send(
        new HeadObjectCommand({
          Bucket: S3_BUCKET,
          Key: job.inputFile,
        })
      );
    } catch (error) {
      console.error('Input file not found in S3:', error);
      return NextResponse.json(
        {
          error: 'FILE_NOT_FOUND',
          message: ERROR_MESSAGES.FILE_NOT_FOUND,
        },
        { status: 404 }
      );
    }

    // 4. AWS Batchジョブを投入
    const batchJobName = `codec-converter-${jobId}`;
    await batchClient.send(
      new SubmitJobCommand({
        jobName: batchJobName,
        jobQueue: BATCH_JOB_QUEUE,
        jobDefinition: BATCH_JOB_DEFINITION,
        containerOverrides: {
          environment: [
            { name: 'JOB_ID', value: jobId },
            { name: 'OUTPUT_CODEC', value: job.outputCodec },
            { name: 'DYNAMODB_TABLE', value: DYNAMODB_TABLE },
            { name: 'S3_BUCKET', value: S3_BUCKET },
            { name: 'AWS_REGION', value: AWS_REGION },
          ],
        },
      })
    );

    // 5. DynamoDBステータスをPROCESSINGに更新
    const now = Math.floor(Date.now() / 1000);
    await docClient.send(
      new UpdateCommand({
        TableName: DYNAMODB_TABLE,
        Key: { jobId },
        UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': 'PROCESSING',
          ':updatedAt': now,
        },
      })
    );

    // レスポンスを返却
    return NextResponse.json(
      {
        jobId,
        status: 'PROCESSING' as JobStatus,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error submitting job:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      },
      { status: 500 }
    );
  }
}
