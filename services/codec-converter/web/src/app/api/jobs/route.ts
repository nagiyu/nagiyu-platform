import { NextRequest, NextResponse } from 'next/server';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import {
  validateFile,
  JOB_EXPIRATION_SECONDS,
  type Job,
  type CodecType,
} from '@nagiyu/codec-converter-core';
import { getAwsClients, createPresignedUploadUrl } from '@nagiyu/aws';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { withApiErrorReporting } from '@/lib/api-error-reporting';

// Presigned URLの有効期限（1時間 = 3600秒）
const PRESIGNED_URL_EXPIRES_IN = 3600;

// 有効なコーデックのリスト
const VALID_CODECS: CodecType[] = ['h264', 'vp9', 'av1'];

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
 * 値が有効なコーデックかどうかを判定する
 *
 * リクエストボディの値は unknown のため、型の確認と値の確認を 1 つにまとめる。
 */
function isValidCodec(value: unknown): value is CodecType {
  return typeof value === 'string' && (VALID_CODECS as string[]).includes(value);
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
 * POST /api/jobs
 * 新しい変換ジョブを作成し、アップロード用の Presigned URL を取得
 */
export const POST = withApiErrorReporting(
  'ジョブ作成に失敗しました',
  async (request: NextRequest) => {
    // AWS クライアントと環境変数の取得
    const { docClient, s3Client } = getAwsClients();
    const { DYNAMODB_TABLE, S3_BUCKET } = getEnvVars();

    // リクエストボディの取得とパース
    const bodyResult = await readJsonObjectBody(request);
    if (!bodyResult.ok) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_REQUEST_BODY,
        },
        { status: 400 }
      );
    }
    const { fileName, fileSize, contentType, outputCodec } = bodyResult.body;

    // 必須フィールドのチェック
    if (!fileName || typeof fileSize !== 'number' || !contentType || !outputCodec) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.MISSING_REQUIRED_FIELDS,
        },
        { status: 400 }
      );
    }

    // 文字列でない値は validateFile が扱えず 500 になるため、ここで弾く
    if (typeof fileName !== 'string' || typeof contentType !== 'string') {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_REQUEST_BODY,
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
    if (!isValidCodec(outputCodec)) {
      return NextResponse.json(
        {
          error: 'INVALID_CODEC',
          message: ERROR_MESSAGES.INVALID_CODEC,
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
    const uploadUrl = await createPresignedUploadUrl(
      {
        bucketName: S3_BUCKET,
        key: inputFileKey,
        contentType,
        expiresIn: PRESIGNED_URL_EXPIRES_IN,
      },
      s3Client
    );

    // レスポンスを返却
    const response: CreateJobResponse = {
      jobId,
      uploadUrl,
      expiresIn: PRESIGNED_URL_EXPIRES_IN,
    };
    return NextResponse.json(response, { status: 201 });
  },
  ERROR_MESSAGES.JOB_CREATION_FAILED
);

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
