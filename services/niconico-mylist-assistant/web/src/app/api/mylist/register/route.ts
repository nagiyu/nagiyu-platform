import { NextRequest, NextResponse } from 'next/server';
import { SubmitJobCommand } from '@aws-sdk/client-batch';
import { listVideosWithSettings } from '@nagiyu/niconico-mylist-assistant-core';
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
}

/**
 * レスポンスの型定義
 */
interface RegisterMylistResponse {
  jobId: string;
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
  };
}

/**
 * 定数定義
 */
const MAX_VIDEOS_TO_FETCH = 1000; // 動画選択時に取得する最大件数

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

    if (body.maxCount < 1 || body.maxCount > 50) {
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
    const { BATCH_JOB_QUEUE, BATCH_JOB_DEFINITION, DYNAMODB_TABLE_NAME, AWS_REGION } = getEnvVars();

    const jobName = `niconico-mylist-${session.user.id}-${Date.now()}`;
    const videoIds = selectedVideos.map((video) => video.videoId);

    // TODO: セキュリティ改善
    // 現在、ニコニコアカウントの認証情報（パスワード）を環境変数として
    // Batchジョブに渡しています。本番運用では以下のいずれかの方法で
    // セキュリティを強化する必要があります：
    // 1. AWS Secrets Manager を使用して認証情報を暗号化保存
    // 2. Systems Manager Parameter Store（SecureString）を使用
    // 3. 暗号化ユーティリティ（core/utils/crypto.ts）を使用してクライアント側で暗号化
    //
    // 参照: roadmap.md Issue 5-1 (暗号化ユーティリティ実装)

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
            { name: 'NICONICO_PASSWORD', value: body.niconicoAccount.password },
            { name: 'DYNAMODB_TABLE_NAME', value: DYNAMODB_TABLE_NAME },
            { name: 'AWS_REGION', value: AWS_REGION },
          ],
        },
      })
    );

    // ジョブIDの確認
    if (!submitResult.jobId) {
      console.error('Batch job submission returned no jobId:', submitResult);
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

    // ジョブIDを返却
    return NextResponse.json(
      {
        jobId: submitResult.jobId,
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
