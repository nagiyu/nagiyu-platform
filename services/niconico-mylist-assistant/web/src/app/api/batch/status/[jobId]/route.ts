import { NextRequest, NextResponse } from 'next/server';
import { getBatchJob } from '@nagiyu/niconico-mylist-assistant-core';
import type { BatchJobStatusResponse } from '@nagiyu/niconico-mylist-assistant-core';
import { getSession } from '@/lib/auth/session';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

/**
 * バッチジョブステータス取得 API
 *
 * ジョブIDで指定されたバッチジョブのステータスと結果を取得します。
 *
 * @see api-spec.md Section 4.2
 * @param request - Next.js リクエストオブジェクト
 * @param params - ルートパラメータ（jobId）
 * @returns バッチジョブステータスレスポンス
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // パラメータを解決
    const { jobId } = await params;

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

    // バッチジョブを取得
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

    // Unix timestamp を ISO 8601 形式に変換
    const response: BatchJobStatusResponse = {
      jobId: batchJob.jobId,
      status: batchJob.status,
      createdAt: new Date(batchJob.CreatedAt).toISOString(),
      updatedAt: new Date(batchJob.UpdatedAt).toISOString(),
    };

    if (batchJob.result !== undefined) {
      response.result = batchJob.result;
    }

    if (batchJob.CompletedAt !== undefined) {
      response.completedAt = new Date(batchJob.CompletedAt).toISOString();
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('バッチジョブステータス取得エラー:', error);
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
