import { DynamoDBJobRepository } from '@nagiyu/quick-clip-core';
import { DescribeJobsCommand } from '@aws-sdk/client-batch';
import { NextResponse } from 'next/server';
import { getBatchClient, getDynamoDBDocumentClient, getTableName } from '@/lib/server/aws';
import { JobDomainService } from '@/lib/server/domain-services';
import type { JobStatus } from '@/types/quick-clip';

const ERROR_MESSAGES = {
  JOB_NOT_FOUND: '指定されたジョブが見つかりません',
} as const;

type RouteParams = {
  params: Promise<{
    jobId: string;
  }>;
};

function mapBatchStatus(batchStatus: string): JobStatus {
  switch (batchStatus) {
    case 'SUBMITTED':
    case 'PENDING':
    case 'RUNNABLE':
    case 'STARTING':
      return 'PENDING';
    case 'RUNNING':
      return 'PROCESSING';
    case 'SUCCEEDED':
      return 'COMPLETED';
    case 'FAILED':
    default:
      return 'FAILED';
  }
}

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

    if (!job.batchJobId) {
      return NextResponse.json({
        jobId: job.jobId,
        status: 'PENDING' as JobStatus,
        originalFileName: job.originalFileName,
        fileSize: job.fileSize,
        createdAt: job.createdAt,
        expiresAt: job.expiresAt,
      });
    }

    const batchResult = await getBatchClient().send(
      new DescribeJobsCommand({ jobs: [job.batchJobId] })
    );
    const batchJob = batchResult.jobs?.[0];
    const batchStatus = batchJob?.status ?? 'FAILED';
    const status = mapBatchStatus(batchStatus);

    return NextResponse.json({
      jobId: job.jobId,
      status,
      originalFileName: job.originalFileName,
      fileSize: job.fileSize,
      createdAt: job.createdAt,
      expiresAt: job.expiresAt,
      ...(status === 'PROCESSING' && job.batchStage ? { batchStage: job.batchStage } : {}),
      ...(status === 'PROCESSING' && job.batchStage === 'analyzing' && job.analysisProgress
        ? { analysisProgress: job.analysisProgress }
        : {}),
      ...(status === 'FAILED' && job.errorMessage ? { errorMessage: job.errorMessage } : {}),
    });
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
