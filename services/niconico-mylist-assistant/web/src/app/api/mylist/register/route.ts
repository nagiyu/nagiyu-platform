import { NextRequest, NextResponse } from 'next/server';
import { SubmitJobCommand } from '@aws-sdk/client-batch';
import { selectRandomVideos, createBatchJob } from '@nagiyu/niconico-mylist-assistant-core';
import { getBatchClient, reportErrorEvent } from '@nagiyu/aws';
import { getSession } from '@/lib/auth/session';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { getEncryptedUserSessionBlob } from '@/lib/niconico-session';
import { toErrorMessage, type ErrorResponse } from '@nagiyu/common';

/**
 * リクエストボディの型定義
 *
 * user_session はボディから受け取らず、サーバー保存済みのものを使用する（Phase 2）。
 */
interface RegisterMylistRequest {
  maxCount: number;
  favoriteOnly?: boolean;
  excludeSkip?: boolean;
  mylistName: string;
  pushSubscription?: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
}

/**
 * レスポンスの型定義
 */
interface RegisterMylistResponse {
  jobId: string;
  status: string;
  message: string;
  estimatedVideos: number;
  selectedCount: number;
}

const DYNAMODB_ERROR_NAMES = new Set([
  'ResourceNotFoundException',
  'ProvisionedThroughputExceededException',
  'RequestLimitExceeded',
  'InternalServerError',
  'ThrottlingException',
  'ValidationException',
  'AccessDeniedException',
]);

/**
 * DynamoDB 関連の例外かどうかを判定
 * `/api/mylist/register` で発生しうる代表的な例外名を `error.name` で判定する
 * @param error 判定対象の例外
 * @returns DynamoDB 関連の例外名に一致する場合は true
 */
function isDynamoDbError(error: unknown): error is Error {
  return error instanceof Error && DYNAMODB_ERROR_NAMES.has(error.name);
}

/**
 * 環境変数を取得
 */
function getEnvVars() {
  return {
    BATCH_JOB_QUEUE: process.env.BATCH_JOB_QUEUE || '',
    BATCH_JOB_DEFINITION: process.env.BATCH_JOB_DEFINITION || '',
    DYNAMODB_TABLE_NAME: process.env.DYNAMODB_TABLE_NAME || '',
    AWS_REGION: process.env.AWS_REGION || 'us-east-1',
    AWS_REGION_FOR_SDK: process.env.AWS_REGION_FOR_SDK || process.env.AWS_REGION || 'us-east-1',
  };
}

/**
 * 定数定義
 */
const SUCCESS_MESSAGES = {
  BATCH_JOB_SUBMITTED: 'バッチジョブを投入しました',
} as const;

/**
 * POST /api/mylist/register
 * マイリスト登録バッチジョブを投入
 *
 * Phase 2: user_session をリクエストボディから受け取らず、サーバー保存済みのものを使用する。
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<RegisterMylistResponse | ErrorResponse>> {
  try {
    // 認証チェック
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          message: ERROR_MESSAGES.UNAUTHORIZED,
        },
        { status: 401 }
      );
    }

    // リクエストボディのパース
    const body = (await request.json()) as RegisterMylistRequest;

    // バリデーション: maxCount
    if (typeof body.maxCount !== 'number') {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.MAX_COUNT_MUST_BE_NUMBER,
        },
        { status: 400 }
      );
    }

    if (!Number.isInteger(body.maxCount)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.MYLIST_REGISTER_MAX_COUNT_MUST_BE_INTEGER,
        },
        { status: 400 }
      );
    }

    if (body.maxCount < 1 || body.maxCount > 100) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.MYLIST_REGISTER_MAX_COUNT_INVALID_RANGE,
        },
        { status: 400 }
      );
    }

    // バリデーション: mylistName
    if (!body.mylistName) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.MYLIST_NAME_REQUIRED,
        },
        { status: 400 }
      );
    }

    if (typeof body.mylistName !== 'string') {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.MYLIST_NAME_MUST_BE_STRING,
        },
        { status: 400 }
      );
    }

    // 保存済みニコニコセッションの取得（Phase 2: リクエストボディの userSession は使用しない）
    const encryptedUserSessionBlob = await getEncryptedUserSessionBlob(session.user.userId);
    if (!encryptedUserSessionBlob) {
      return NextResponse.json(
        {
          error: 'SESSION_NOT_REGISTERED',
          message: ERROR_MESSAGES.NICONICO_SESSION_NOT_REGISTERED,
        },
        { status: 400 }
      );
    }

    // 動画選択ロジック
    // 1. フィルタ条件に基づいて動画を取得
    let selectedVideos: Awaited<ReturnType<typeof selectRandomVideos>>;
    try {
      selectedVideos = await selectRandomVideos({
        userId: session.user.userId,
        maxCount: body.maxCount,
        favoriteOnly: body.favoriteOnly,
        skipExclude: body.excludeSkip,
      });
    } catch (error) {
      if (isDynamoDbError(error)) {
        return NextResponse.json(
          {
            error: 'DATABASE_ERROR',
            message: ERROR_MESSAGES.MYLIST_REGISTER_VIDEO_FETCH_FAILED,
          },
          { status: 500 }
        );
      }
      throw error;
    }

    // 動画が0件の場合はエラー
    if (selectedVideos.length === 0) {
      return NextResponse.json(
        {
          error: 'NO_VIDEOS',
          message: ERROR_MESSAGES.NO_VIDEOS_AVAILABLE,
        },
        { status: 400 }
      );
    }

    // AWS Batch ジョブを投入
    const { BATCH_JOB_QUEUE, BATCH_JOB_DEFINITION, DYNAMODB_TABLE_NAME, AWS_REGION } = getEnvVars();
    const batchClient = getBatchClient(AWS_REGION);

    const jobName = `niconico-mylist-${session.user.userId}-${Date.now()}`;
    const videoIds = selectedVideos.map((video) => video.videoId);

    // 保存済みブロブをそのまま ENCRYPTED_USER_SESSION として渡す（再暗号化不要）
    const submitResult = await batchClient.send(
      new SubmitJobCommand({
        jobName,
        jobQueue: BATCH_JOB_QUEUE,
        jobDefinition: BATCH_JOB_DEFINITION,
        containerOverrides: {
          environment: [
            { name: 'USER_ID', value: session.user.userId },
            { name: 'VIDEO_IDS', value: JSON.stringify(videoIds) },
            { name: 'MYLIST_NAME', value: body.mylistName },
            { name: 'ENCRYPTED_USER_SESSION', value: encryptedUserSessionBlob },
            { name: 'DYNAMODB_TABLE_NAME', value: DYNAMODB_TABLE_NAME },
            { name: 'AWS_REGION', value: AWS_REGION },
          ],
        },
      })
    );

    // ジョブIDの確認
    if (!submitResult.jobId) {
      console.error('Batch job submission returned no jobId:', submitResult.jobId);
      await reportErrorEvent({
        serviceId: 'niconico-mylist-assistant',
        severity: 'error',
        title: 'Batch ジョブ ID 未取得',
        message: 'SubmitJob のレスポンスにジョブ ID が含まれていませんでした',
        context: {
          userId: session.user.userId,
          jobName,
        },
      });
      return NextResponse.json(
        {
          error: 'BATCH_ERROR',
          message: ERROR_MESSAGES.BATCH_JOB_SUBMISSION_FAILED,
          details: ['ジョブIDが取得できませんでした'],
        },
        { status: 500 }
      );
    }

    // DynamoDB にバッチジョブレコードを作成
    // Web 側でジョブステータスを照会できるようにする
    try {
      await createBatchJob({
        jobId: submitResult.jobId,
        userId: session.user.userId,
        status: 'SUBMITTED',
        pushSubscription: body.pushSubscription,
      });
      console.log(`バッチジョブレコードを作成しました: ${submitResult.jobId}`);
    } catch (error) {
      console.error('バッチジョブレコード作成エラー:', error);
      await reportErrorEvent({
        serviceId: 'niconico-mylist-assistant',
        severity: 'error',
        title: 'DynamoDB バッチジョブレコード作成失敗',
        message: toErrorMessage(error),
        context: {
          userId: session.user.userId,
          jobId: submitResult.jobId,
          error: toErrorMessage(error),
        },
      });
      // DynamoDB への保存に失敗した場合はエラーを返す
      // ジョブステータスが照会できないため
      return NextResponse.json(
        {
          error: 'DATABASE_ERROR',
          message: ERROR_MESSAGES.DATABASE_ERROR,
          details: ['ジョブステータス管理レコードの作成に失敗しました'],
        },
        { status: 500 }
      );
    }

    // ジョブIDを返却
    return NextResponse.json(
      {
        jobId: submitResult.jobId,
        status: 'SUBMITTED',
        message: SUCCESS_MESSAGES.BATCH_JOB_SUBMITTED,
        estimatedVideos: selectedVideos.length,
        selectedCount: selectedVideos.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('バッチジョブ投入エラー:', error);
    await reportErrorEvent({
      serviceId: 'niconico-mylist-assistant',
      severity: 'error',
      title: 'Batch ジョブ投入エラー',
      message: toErrorMessage(error),
      context: {
        error: toErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    });

    // AWS Batch エラー
    return NextResponse.json(
      {
        error: 'BATCH_ERROR',
        message: ERROR_MESSAGES.BATCH_JOB_SUBMISSION_FAILED,
      },
      { status: 500 }
    );
  }
}
