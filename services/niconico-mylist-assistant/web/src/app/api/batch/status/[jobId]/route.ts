import { NextRequest, NextResponse } from 'next/server';
import { getDynamoDBDocumentClient, getTableName } from '@nagiyu/aws';
import { withAuth, withRepository, handleApiError } from '@nagiyu/nextjs';
import type { BatchJobRepository } from '@nagiyu/niconico-mylist-assistant-core';
import { DynamoDBBatchJobRepository } from '@nagiyu/niconico-mylist-assistant-core';
import type { BatchJobStatusResponse } from '@nagiyu/niconico-mylist-assistant-core';
import { getSession } from '@/lib/auth/session';

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
const getDynamoDBClient = () => getDynamoDBDocumentClient(process.env.AWS_REGION || 'us-east-1');

const withBatchJobRepository = withRepository(
  getDynamoDBClient,
  getTableName,
  DynamoDBBatchJobRepository,
  async (
    batchJobRepository: BatchJobRepository,
    _request: NextRequest,
    { params }: RouteParams,
    session: NonNullable<Awaited<ReturnType<typeof getSession>>>
  ) => {
    const { jobId } = await params;
    // バッチジョブを取得
    const batchJob = await batchJobRepository.getById(jobId, session.user.id);

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
  }
);

export const GET = withAuth(
  getSession,
  null,
  async (session, request: NextRequest, context: RouteParams) => {
    try {
      return await withBatchJobRepository(request, context, session);
    } catch (error) {
      return handleApiError(error);
    }
  }
);
