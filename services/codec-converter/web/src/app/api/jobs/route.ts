import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import {
  validateFile,
  JOB_EXPIRATION_SECONDS,
  type Job,
  type CodecType,
} from 'codec-converter-core';

// Presigned URLの有効期限（1時間 = 3600秒）
const PRESIGNED_URL_EXPIRES_IN = 3600;

// 有効なコーデックのリスト
const VALID_CODECS: CodecType[] = ['h264', 'vp9', 'av1'];

// AWS クライアントのシングルトン
let cachedDocClient: DynamoDBDocumentClient | null = null;
let cachedS3Client: S3Client | null = null;

/**
 * AWS クライアントを取得（シングルトンパターン）
 */
function getAwsClients() {
  if (!cachedDocClient || !cachedS3Client) {
    const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
    const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
    cachedDocClient = DynamoDBDocumentClient.from(dynamoClient);
    cachedS3Client = new S3Client({ region: AWS_REGION });
  }

  return { docClient: cachedDocClient, s3Client: cachedS3Client };
}

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
 * リクエストボディの型定義
 */
interface CreateJobRequest {
  fileName: string;
  fileSize: number;
  contentType: string;
  outputCodec: CodecType;
}

/**
 * レスポンスボディの型定義
 */
interface CreateJobResponse {
  jobId: string;
  uploadUrl: string;
  expiresIn: number;
}

/**
 * エラーレスポンスの型定義
 */
interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * POST /api/jobs
 * 新しい変換ジョブを作成し、アップロード用の Presigned URL を取得
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<CreateJobResponse | ErrorResponse>> {
  try {
    // AWS クライアントと環境変数の取得
    const { docClient, s3Client } = getAwsClients();
    const { DYNAMODB_TABLE, S3_BUCKET } = getEnvVars();

    // リクエストボディの取得とパース
    const body: CreateJobRequest = await request.json();
    const { fileName, fileSize, contentType, outputCodec } = body;

    // 必須フィールドのチェック
    if (!fileName || typeof fileSize !== 'number' || !contentType || !outputCodec) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: '必須フィールドが不足しています',
        },
        { status: 400 }
      );
    }

    // ファイルのバリデーション
    const validationResult = validateFile(fileName, fileSize, contentType);
    if (!validationResult.isValid) {
      const errorCode = getErrorCode(validationResult.errorMessage || '');
      return NextResponse.json(
        {
          error: errorCode,
          message: validationResult.errorMessage || 'バリデーションエラー',
        },
        { status: 400 }
      );
    }

    // outputCodecのバリデーション
    if (!VALID_CODECS.includes(outputCodec)) {
      return NextResponse.json(
        {
          error: 'INVALID_CODEC',
          message: '無効なコーデックが指定されました',
        },
        { status: 400 }
      );
    }

    // ジョブIDの生成 (UUID v4)
    const jobId = uuidv4();

    // 現在時刻（Unix timestamp 秒）
    const now = Math.floor(Date.now() / 1000);

    // S3キーの構築
    const inputFileKey = `uploads/${jobId}/input.mp4`;

    // DynamoDBにジョブレコードを作成
    const job: Job = {
      jobId,
      status: 'PENDING',
      inputFile: inputFileKey,
      outputCodec,
      fileName,
      fileSize,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + JOB_EXPIRATION_SECONDS,
    };

    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: job,
      })
    );

    // S3 Presigned URLの生成
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: inputFileKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: PRESIGNED_URL_EXPIRES_IN,
    });

    // レスポンスを返却
    return NextResponse.json(
      {
        jobId,
        uploadUrl,
        expiresIn: PRESIGNED_URL_EXPIRES_IN,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating job:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: 'ジョブの作成に失敗しました',
      },
      { status: 500 }
    );
  }
}

/**
 * バリデーションエラーメッセージからエラーコードを取得
 */
function getErrorCode(errorMessage: string): string {
  if (errorMessage.includes('ファイルサイズ')) {
    return 'INVALID_FILE_SIZE';
  }
  // MP4関連のエラーメッセージ
  return 'INVALID_FILE_TYPE';
}
