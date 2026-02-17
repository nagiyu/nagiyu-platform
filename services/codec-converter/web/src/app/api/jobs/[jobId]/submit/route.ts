import { NextRequest, NextResponse } from 'next/server';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { SubmitJobCommand } from '@aws-sdk/client-batch';
import { type Job, type JobStatus, selectJobDefinition } from 'codec-converter-core';
import { getAwsClients } from '@/lib/aws-clients';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  JOB_NOT_FOUND: '指定されたジョブが見つかりません',
  INVALID_STATUS: 'ジョブは既に実行中または完了しています',
  FILE_NOT_FOUND: '入力ファイルが見つかりません',
  INVALID_JOB_DEFINITION: 'ジョブ定義の選択に失敗しました',
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
    BATCH_JOB_DEFINITION_PREFIX: process.env.BATCH_JOB_DEFINITION_PREFIX || '',
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
    const { DYNAMODB_TABLE, S3_BUCKET, BATCH_JOB_QUEUE, BATCH_JOB_DEFINITION_PREFIX, AWS_REGION } =
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

    // リソース選択ロジックを呼び出し
    let jobDefinitionSize: string;
    try {
      jobDefinitionSize = selectJobDefinition(job.fileSize, job.outputCodec);
    } catch (error) {
      console.error('Failed to select job definition, falling back to medium:', error);
      jobDefinitionSize = 'medium';
    }

    const jobDefinitionName = `${BATCH_JOB_DEFINITION_PREFIX}-${jobDefinitionSize}`;
    console.log(
      `Submitting job ${jobId} with definition ${jobDefinitionName} (fileSize: ${job.fileSize}, codec: ${job.outputCodec})`
    );

    try {
      await batchClient.send(
        new SubmitJobCommand({
          jobName: batchJobName,
          jobQueue: BATCH_JOB_QUEUE,
          jobDefinition: jobDefinitionName,
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
    } catch (error: unknown) {
      // Batch ジョブ投入エラーのフォールバック処理
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('job definition') || errorMessage.includes('JobDefinition')) {
        console.warn(
          `Failed to submit job with definition ${jobDefinitionName}, falling back to medium:`,
          error
        );
        const fallbackJobDefinitionName = `${BATCH_JOB_DEFINITION_PREFIX}-medium`;
        await batchClient.send(
          new SubmitJobCommand({
            jobName: batchJobName,
            jobQueue: BATCH_JOB_QUEUE,
            jobDefinition: fallbackJobDefinitionName,
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
      } else {
        throw error;
      }
    }

    // レスポンスを返却
    // 注: ステータスはPENDINGのまま。Batch Workerが起動時にPROCESSINGに更新する
    return NextResponse.json(
      {
        jobId,
        status: 'PENDING' as JobStatus,
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
