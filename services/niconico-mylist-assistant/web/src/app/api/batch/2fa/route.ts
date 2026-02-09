import { NextRequest, NextResponse } from 'next/server';
import {
  updateBatchJob,
  getBatchJob,
  TWO_FACTOR_AUTH_CODE_REGEX,
} from '@nagiyu/niconico-mylist-assistant-core';
import { getSession } from '@/lib/auth/session';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

/**
 * 二段階認証コード登録リクエスト
 */
interface TwoFactorAuthRequest {
  jobId: string;
  code: string;
}

/**
 * 二段階認証コード登録 API
 *
 * バッチジョブに二段階認証コードを登録します。
 * バッチ側がポーリングでこのコードを取得して処理を継続します。
 *
 * @param request - Next.js リクエストオブジェクト
 * @returns 成功レスポンスまたはエラーレスポンス
 */
export async function POST(request: NextRequest) {
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

    // リクエストボディを取得
    const body: TwoFactorAuthRequest = await request.json();
    const { jobId, code } = body;

    // バリデーション
    if (!jobId || !code) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'ジョブIDと二段階認証コードは必須です',
          },
        },
        { status: 400 }
      );
    }

    // 二段階認証コードの形式チェック（6桁の数字）
    if (!TWO_FACTOR_AUTH_CODE_REGEX.test(code)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_CODE',
            message: '二段階認証コードは6桁の数字である必要があります',
          },
        },
        { status: 400 }
      );
    }

    // バッチジョブの存在確認
    const batchJob = await getBatchJob(jobId, session.user.id);

    if (!batchJob) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'バッチジョブが見つかりません',
          },
        },
        { status: 404 }
      );
    }

    // ステータスが WAITING_FOR_2FA であることを確認
    if (batchJob.status !== 'WAITING_FOR_2FA') {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_STATUS',
            message: 'このジョブは二段階認証待ち状態ではありません',
          },
        },
        { status: 400 }
      );
    }

    // バッチジョブに二段階認証コードを登録
    await updateBatchJob(jobId, session.user.id, {
      status: 'WAITING_FOR_2FA', // ステータスは変更しない
      twoFactorAuthCode: code,
    });

    return NextResponse.json({
      success: true,
      message: '二段階認証コードを登録しました',
    });
  } catch (error) {
    console.error('二段階認証コード登録エラー:', error);
    return NextResponse.json(
      {
        error: {
          code: 'DATABASE_ERROR',
          message: 'データベースへのアクセスに失敗しました',
        },
      },
      { status: 500 }
    );
  }
}
