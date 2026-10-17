import { NextRequest, NextResponse } from 'next/server';
import { getAwsClients, createPresignedDownloadUrl } from '@nagiyu/aws';
import { DynamoDBJobRepository, type Job } from '@nagiyu/codec-converter-core';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { withApiErrorReporting } from '@/lib/api-error-reporting';

// Presigned URLの有効期限（24時間 = 86400秒）
const PRESIGNED_URL_EXPIRES_IN = 86400;

/**
 * 環境変数を取得
 */
function getEnvVars() {
  return {
    DYNAMODB_TABLE: process.env.DYNAMODB_TABLE || '',
    S3_BUCKET: process.env.S3_BUCKET || '',
    AWS_REGION: process.env.AWS_REGION || 'us-east-1',
  };
}

/**
 * 成功レスポンスの型定義
 */
interface GetJobResponse extends Job {
  downloadUrl?: string;
}

/**
 * GET /api/jobs/{jobId}
 * ジョブステータスとダウンロードURL（COMPLETED時のみ）を取得
 */
export const GET = withApiErrorReporting(
  'Web API: ジョブ取得エラー',
  async (request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) => {
    // パスパラメータの取得
    const { jobId } = await params;

    // AWS クライアントと環境変数の取得
    const { DYNAMODB_TABLE, S3_BUCKET, AWS_REGION } = getEnvVars();
    const { docClient, s3Client } = getAwsClients(AWS_REGION);

    // DynamoDBでジョブを取得
    const job = await new DynamoDBJobRepository(docClient, DYNAMODB_TABLE).getById(jobId);

    if (!job) {
      return NextResponse.json(
        {
          error: 'JOB_NOT_FOUND',
          message: ERROR_MESSAGES.JOB_NOT_FOUND,
        },
        { status: 404 }
      );
    }

    // ジョブステータスがCOMPLETEDの場合、ダウンロード用Presigned URLを生成
    let downloadUrl: string | undefined;
    if (job.status === 'COMPLETED' && job.outputFile) {
      downloadUrl = await createPresignedDownloadUrl(
        {
          bucketName: S3_BUCKET,
          key: job.outputFile,
          expiresIn: PRESIGNED_URL_EXPIRES_IN,
        },
        s3Client
      );
    }

    // レスポンスを返却
    const response: GetJobResponse = {
      ...job,
      ...(downloadUrl && { downloadUrl }),
    };
    return NextResponse.json(response, { status: 200 });
  },
  ERROR_MESSAGES.JOB_FETCH_FAILED
);
