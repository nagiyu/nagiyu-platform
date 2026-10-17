import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { getBatchJob } from '@nagiyu/niconico-mylist-assistant-core';
import type { BatchJobStatusResponse } from '@nagiyu/niconico-mylist-assistant-core';
import { getSession } from '@/lib/auth/session';
import { withApiErrorReporting } from '@/lib/api-error-reporting';

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

/**
 * バッチジョブステータス取得 API
 *
 * ジョブIDで指定されたバッチジョブのステータスと結果を取得します。
 * リポジトリは core の db 関数経由で取得するため、USE_IN_MEMORY_DB の切り替えが効きます。
 *
 * @see api-spec.md Section 4.2
 * @param request - Next.js リクエストオブジェクト
 * @param params - ルートパラメータ（jobId）
 * @returns バッチジョブステータスレスポンス
 */
export const GET = withApiErrorReporting(
  'Web API: バッチジョブステータス取得エラー',
  withAuth(getSession, null, async (session, _request: NextRequest, { params }: RouteParams) => {
    const { jobId } = await params;
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
      createdAt: new Date(batchJob.createdAt).toISOString(),
      updatedAt: new Date(batchJob.updatedAt).toISOString(),
    };

    if (batchJob.result !== undefined) {
      response.result = batchJob.result;
    }

    if (batchJob.completedAt !== undefined) {
      response.completedAt = new Date(batchJob.completedAt).toISOString();
    }

    return NextResponse.json(response);
  })
);
