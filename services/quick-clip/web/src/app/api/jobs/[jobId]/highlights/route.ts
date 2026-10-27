import { DynamoDBHighlightRepository, DynamoDBJobRepository } from '@nagiyu/quick-clip-core';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import { NextResponse } from 'next/server';
import { createPresignedDownloadUrl } from '@nagiyu/aws';
import {
  getBucketName,
  getDynamoDBDocumentClient,
  getS3Client,
  getTableName,
} from '@/lib/server/aws';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { HighlightDomainService, JobDomainService } from '@/lib/server/domain-services';

const ERROR_MESSAGES = {
  JOB_NOT_FOUND: COMMON_ERROR_MESSAGES.JOB_NOT_FOUND,
  INTERNAL_SERVER_ERROR: '見どころ一覧の取得に失敗しました',
} as const;

const CLIP_URL_EXPIRES_IN = 3600;
const buildClipKey = (jobId: string, highlightId: string): string =>
  `outputs/${jobId}/clips/${highlightId}.mp4`;

type RouteParams = {
  params: Promise<{
    jobId: string;
  }>;
};

export const GET = withApiErrorReporting(
  'Web API: 見どころ一覧取得エラー',
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
    const bucketName = getBucketName();

    const results = await Promise.all(
      highlights.map(async (highlight) => {
        if (highlight.clipStatus === 'GENERATED') {
          const clipUrl = await createPresignedDownloadUrl(
            {
              bucketName,
              key: buildClipKey(jobId, highlight.highlightId),
              expiresIn: CLIP_URL_EXPIRES_IN,
            },
            getS3Client()
          );
          return { ...highlight, clipUrl };
        }

        return { ...highlight, clipUrl: undefined };
      })
    );

    return NextResponse.json({ highlights: results });
  }
);
