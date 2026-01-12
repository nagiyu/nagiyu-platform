import { NextRequest, NextResponse } from 'next/server';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { type Job } from 'codec-converter-core';
import { getAwsClients } from '@/lib/aws-clients';

// Presigned URLの有効期限（24時間 = 86400秒）
const PRESIGNED_URL_EXPIRES_IN = 86400;

// エラーメッセージ定数
const ERROR_MESSAGES = {
  JOB_NOT_FOUND: '指定されたジョブが見つかりません',
  INTERNAL_SERVER_ERROR: 'ジョブの取得に失敗しました',
} as const;

/**
 * 環境変数を取得
 */
function getEnvVars() {
  return {
    DYNAMODB_TABLE: process.env.DYNAMODB_TABLE || '',
    S3_BUCKET: process.env.S3_BUCKET || '',
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
interface GetJobResponse extends Job {
  downloadUrl?: string;
}

/**
 * GET /api/jobs/{jobId}
 * ジョブステータスとダウンロードURL（COMPLETED時のみ）を取得
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<NextResponse<GetJobResponse | ErrorResponse>> {
  try {
    // パスパラメータの取得
    const { jobId } = await params;

    // AWS クライアントと環境変数の取得
    const { docClient, s3Client } = getAwsClients();
    const { DYNAMODB_TABLE, S3_BUCKET } = getEnvVars();

    // DynamoDBでジョブを取得
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

    // ジョブステータスがCOMPLETEDの場合、ダウンロード用Presigned URLを生成
    let downloadUrl: string | undefined;
    if (job.status === 'COMPLETED' && job.outputFile) {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: job.outputFile,
      });

      downloadUrl = await getSignedUrl(s3Client, command, {
        expiresIn: PRESIGNED_URL_EXPIRES_IN,
      });
    }

    // レスポンスを返却
    return NextResponse.json(
      {
        ...job,
        ...(downloadUrl && { downloadUrl }),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error getting job:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      },
      { status: 500 }
    );
  }
}
