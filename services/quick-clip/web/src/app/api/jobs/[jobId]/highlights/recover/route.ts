import { DynamoDBHighlightRepository, DynamoDBJobRepository } from '@nagiyu/quick-clip-core';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import { NextResponse } from 'next/server';
import { getDynamoDBDocumentClient, getTableName } from '@/lib/server/aws';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { HighlightDomainService, JobDomainService } from '@/lib/server/domain-services';
import { findStuckGeneratingHighlights } from '@/lib/server/highlight-recovery';

const ERROR_MESSAGES = {
  JOB_NOT_FOUND: COMMON_ERROR_MESSAGES.JOB_NOT_FOUND,
  INTERNAL_SERVER_ERROR: '見どころの復旧に失敗しました',
} as const;

type RouteParams = {
  params: Promise<{
    jobId: string;
  }>;
};

export const POST = withApiErrorReporting(
  'Web API: 見どころ復旧エラー',
  ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
  async (_request: Request, { params }: RouteParams): Promise<NextResponse> => {
    const { jobId } = await params;
    const jobService = new JobDomainService(
      new DynamoDBJobRepository(getDynamoDBDocumentClient(), getTableName())
    );
    const job = await jobService.getJob(jobId);
    if (!job) {
      return NextResponse.json(
        {
          error: 'JOB_NOT_FOUND',
          message: ERROR_MESSAGES.JOB_NOT_FOUND,
        },
        { status: 404 }
      );
    }

    const highlightService = new HighlightDomainService(
      new DynamoDBHighlightRepository(getDynamoDBDocumentClient(), getTableName())
    );
    const highlights = await highlightService.getHighlights(jobId);
    const stuckHighlights = findStuckGeneratingHighlights(highlights, Date.now());

    await Promise.all(
      stuckHighlights.map((highlight) =>
        highlightService.updateHighlight(jobId, highlight.highlightId, { clipStatus: 'FAILED' })
      )
    );

    return NextResponse.json({
      recoveredHighlightIds: stuckHighlights.map((highlight) => highlight.highlightId),
    });
  }
);
