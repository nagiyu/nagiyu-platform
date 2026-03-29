import { DynamoDBJobRepository } from '@nagiyu/quick-clip-core';
import { NextResponse } from 'next/server';
import { getDynamoDBDocumentClient, getTableName } from '@/lib/server/aws';
import { JobDomainService } from '@/lib/server/domain-services';

const ERROR_MESSAGES = {
  JOB_NOT_FOUND: '指定されたジョブが見つかりません',
} as const;

type RouteParams = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
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

    return NextResponse.json(job);
  } catch {
    return NextResponse.json(
      {
        error: 'JOB_NOT_FOUND',
        message: ERROR_MESSAGES.JOB_NOT_FOUND,
      },
      { status: 404 }
    );
  }
}
