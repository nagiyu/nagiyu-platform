import { NextResponse } from 'next/server';
import { HighlightDomainService, JobDomainService } from '@/lib/server/domain-services';
import { getHighlightRepository } from '@/repositories/dynamodb-highlight.repository';
import { getJobRepository } from '@/repositories/dynamodb-job.repository';

const ERROR_MESSAGES = {
  JOB_NOT_FOUND: '指定されたジョブが見つかりません',
  INTERNAL_SERVER_ERROR: '見どころ一覧の取得に失敗しました',
} as const;

type RouteParams = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { jobId } = await params;
    const jobService = new JobDomainService(getJobRepository());
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

    const highlightService = new HighlightDomainService(getHighlightRepository());
    const highlights = await highlightService.getHighlights(jobId);

    return NextResponse.json({ highlights });
  } catch {
    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      },
      { status: 500 }
    );
  }
}
