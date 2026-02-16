import { NextRequest, NextResponse } from 'next/server';
import { SubmitJobCommand } from '@aws-sdk/client-batch';
import {
  listVideosWithSettings,
  encrypt,
  createBatchJob,
} from '@nagiyu/niconico-mylist-assistant-core';
import type { CryptoConfig } from '@nagiyu/niconico-mylist-assistant-core';
import { getSession } from '@/lib/auth/session';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { getAwsClients } from '@/lib/aws-clients';

/**
 * リクエストボディの型定義
 */
interface RegisterMylistRequest {
  maxCount: number;
  favoriteOnly?: boolean;
  excludeSkip?: boolean;
  mylistName: string;
  niconicoAccount: {
    email: string;
    password: string;
  };
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

/**
 * エラーレスポンスの型定義
 */
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: string;
  };
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
    ENCRYPTION_SECRET_NAME:
      process.env.ENCRYPTION_SECRET_NAME || process.env.SHARED_SECRET_KEY || '',
    AWS_REGION_FOR_SDK: process.env.AWS_REGION_FOR_SDK || process.env.AWS_REGION || 'us-east-1',
  };
}

/**
 * 定数定義
 */
const MAX_VIDEOS_TO_FETCH = 1000; // 動画選択時に取得する最大件数
const SUCCESS_MESSAGES = {
  BATCH_JOB_SUBMITTED: 'バッチジョブを投入しました',
} as const;

/**
 * POST /api/mylist/register
 * マイリスト登録バッチジョブを投入
 *
 * @see roadmap.md#L551-L563
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
          error: {
            code: 'UNAUTHORIZED',
            message: ERROR_MESSAGES.UNAUTHORIZED,
          },
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
          error: {
            code: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.MAX_COUNT_MUST_BE_NUMBER,
          },
        },
        { status: 400 }
      );
    }

    if (body.maxCount < 1 || body.maxCount > 100) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.MAX_COUNT_INVALID_RANGE,
          },
        },
        { status: 400 }
      );
    }

    // バリデーション: mylistName
    if (!body.mylistName) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.MYLIST_NAME_REQUIRED,
          },
        },
        { status: 400 }
      );
    }

    if (typeof body.mylistName !== 'string') {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.MYLIST_NAME_MUST_BE_STRING,
          },
        },
        { status: 400 }
      );
    }

    // バリデーション: niconicoAccount
    if (!body.niconicoAccount) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.NICONICO_ACCOUNT_REQUIRED,
          },
        },
        { status: 400 }
      );
    }

    if (!body.niconicoAccount.email) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.NICONICO_EMAIL_REQUIRED,
          },
        },
        { status: 400 }
      );
    }

    if (!body.niconicoAccount.password) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.NICONICO_PASSWORD_REQUIRED,
          },
        },
        { status: 400 }
      );
    }

    // 動画選択ロジック
    // 1. フィルタ条件に基づいて動画を取得
    const filters: {
      isFavorite?: boolean;
      isSkip?: boolean;
    } = {};

    if (body.favoriteOnly === true) {
      filters.isFavorite = true;
    }

    if (body.excludeSkip === true) {
      filters.isSkip = false;
    }

    // DynamoDBから動画を取得（全件取得してフィルタ・ランダム選択）
    const { videos } = await listVideosWithSettings(session.user.id, {
      ...filters,
      limit: MAX_VIDEOS_TO_FETCH,
      offset: 0,
    });

    // 2. ランダムに選択（Fisher-Yates shuffle）
    const shuffled = [...videos];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // 3. maxCount 件まで選択
    const selectedVideos = shuffled.slice(0, body.maxCount);

    // 動画が0件の場合はエラー
    if (selectedVideos.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_VIDEOS',
            message: ERROR_MESSAGES.NO_VIDEOS_AVAILABLE,
          },
        },
        { status: 400 }
      );
    }

    // AWS Batch ジョブを投入
    const { batchClient } = getAwsClients();
    const {
      BATCH_JOB_QUEUE,
      BATCH_JOB_DEFINITION,
      DYNAMODB_TABLE_NAME,
      AWS_REGION,
      ENCRYPTION_SECRET_NAME,
      AWS_REGION_FOR_SDK,
    } = getEnvVars();

    const jobName = `niconico-mylist-${session.user.id}-${Date.now()}`;
    const videoIds = selectedVideos.map((video) => video.videoId);

    // パスワードの暗号化
    // AES-256-GCM で暗号化し、Batch ジョブに安全に渡す
    const cryptoConfig: CryptoConfig = {
      secretName: ENCRYPTION_SECRET_NAME,
      region: AWS_REGION_FOR_SDK,
    };

    let encryptedPasswordJson: string;
    try {
      const encryptedData = await encrypt(body.niconicoAccount.password, cryptoConfig);
      encryptedPasswordJson = JSON.stringify(encryptedData);
    } catch (error) {
      console.error('パスワード暗号化エラー:', error);
      return NextResponse.json(
        {
          error: {
            code: 'ENCRYPTION_ERROR',
            message: ERROR_MESSAGES.PASSWORD_ENCRYPTION_FAILED,
            details: error instanceof Error ? error.message : String(error),
          },
        },
        { status: 500 }
      );
    }

    const submitResult = await batchClient.send(
      new SubmitJobCommand({
        jobName,
        jobQueue: BATCH_JOB_QUEUE,
        jobDefinition: BATCH_JOB_DEFINITION,
        containerOverrides: {
          environment: [
            { name: 'USER_ID', value: session.user.id },
            { name: 'VIDEO_IDS', value: JSON.stringify(videoIds) },
            { name: 'MYLIST_NAME', value: body.mylistName },
            { name: 'NICONICO_EMAIL', value: body.niconicoAccount.email },
            { name: 'ENCRYPTED_PASSWORD', value: encryptedPasswordJson },
            { name: 'DYNAMODB_TABLE_NAME', value: DYNAMODB_TABLE_NAME },
            { name: 'AWS_REGION', value: AWS_REGION },
            // Note: BATCH_JOB_ID will be added after job submission
          ],
        },
      })
    );

    // ジョブIDの確認
    if (!submitResult.jobId) {
      console.error('Batch job submission returned no jobId:', submitResult.jobId);
      return NextResponse.json(
        {
          error: {
            code: 'BATCH_ERROR',
            message: ERROR_MESSAGES.BATCH_JOB_SUBMISSION_FAILED,
            details: 'ジョブIDが取得できませんでした',
          },
        },
        { status: 500 }
      );
    }

    // DynamoDB にバッチジョブレコードを作成
    // Web 側でジョブステータスを照会できるようにする
    try {
      await createBatchJob({
        jobId: submitResult.jobId,
        userId: session.user.id,
        status: 'SUBMITTED',
        pushSubscription: body.pushSubscription,
      });
      console.log(`バッチジョブレコードを作成しました: ${submitResult.jobId}`);
    } catch (error) {
      console.error('バッチジョブレコード作成エラー:', error);
      // DynamoDB への保存に失敗した場合はエラーを返す
      // ジョブステータスが照会できないため
      return NextResponse.json(
        {
          error: {
            code: 'DATABASE_ERROR',
            message: ERROR_MESSAGES.DATABASE_ERROR,
            details: 'ジョブステータス管理レコードの作成に失敗しました',
          },
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

    // DynamoDB エラー
    if (error instanceof Error && error.name === 'ResourceNotFoundException') {
      return NextResponse.json(
        {
          error: {
            code: 'DATABASE_ERROR',
            message: ERROR_MESSAGES.DATABASE_ERROR,
          },
        },
        { status: 500 }
      );
    }

    // AWS Batch エラー
    return NextResponse.json(
      {
        error: {
          code: 'BATCH_ERROR',
          message: ERROR_MESSAGES.BATCH_JOB_SUBMISSION_FAILED,
        },
      },
      { status: 500 }
    );
  }
}
