import { NextRequest, NextResponse } from 'next/server';
import {
  updateBatchJob,
  getBatchJob,
  TWO_FACTOR_AUTH_CODE_REGEX,
} from '@nagiyu/niconico-mylist-assistant-core';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import { getSession } from '@/lib/auth/session';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createWithApiErrorReportingBody } from '@/lib/api-error-reporting';

/**
 * 二段階認証コード登録 API
 *
 * バッチジョブに二段階認証コードを登録します。
 * バッチ側がポーリングでこのコードを取得して処理を継続します。
 *
 * @param request - Next.js リクエストオブジェクト
 * @returns 成功レスポンスまたはエラーレスポンス
 */
const withApiErrorReporting = createWithApiErrorReportingBody('二段階認証コード登録エラー:', {
  error: {
    code: 'DATABASE_ERROR',
    message: 'データベースへのアクセスに失敗しました',
  },
});

export const POST = withApiErrorReporting(
  'Web API: 二段階認証コード登録エラー',
  async (request: NextRequest) => {
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
    const bodyResult = await readJsonObjectBody(request);
    if (!bodyResult.ok) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.INVALID_REQUEST_BODY,
          },
        },
        { status: 400 }
      );
    }

    const { jobId, code } = bodyResult.body;

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

    if (typeof jobId !== 'string') {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.JOB_ID_MUST_BE_STRING,
          },
        },
        { status: 400 }
      );
    }

    // 二段階認証コードの形式チェック（6桁の数字）
    // 正規表現は引数を文字列へ変換して判定するため、文字列以外 (例: 数値 123456) を通さないよう型も確かめる
    if (typeof code !== 'string' || !TWO_FACTOR_AUTH_CODE_REGEX.test(code)) {
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
  }
);
