import { DynamoDBHighlightRepository, DynamoDBJobRepository } from '@nagiyu/quick-clip-core';
import { NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  getBucketName,
  getDynamoDBDocumentClient,
  getS3Client,
  getTableName,
} from '@/lib/server/aws';
import { HighlightDomainService, JobDomainService } from '@/lib/server/domain-services';

const ERROR_MESSAGES = {
  JOB_NOT_FOUND: '指定されたジョブが見つかりません',
  INTERNAL_SERVER_ERROR: '見どころ一覧の取得に失敗しました',
} as const;

// 見どころ確認画面での操作時間を考慮し、プレビューURLは1時間有効とする。
const PREVIEW_URL_EXPIRES_IN = 3600;
const buildPreviewClipKey = (jobId: string, highlightId: string): string =>
  `outputs/${jobId}/clips/${highlightId}.mp4`;

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

    const highlightService = new HighlightDomainService(
      new DynamoDBHighlightRepository(getDynamoDBDocumentClient(), getTableName())
    );
    const highlights = await highlightService.getHighlights(jobId);
    const bucketName = getBucketName();
    const enrichedHighlights = await Promise.all(
      highlights.map(async (highlight) => {
        try {
          const previewUrl = await getSignedUrl(
            getS3Client(),
            new GetObjectCommand({
              Bucket: bucketName,
              Key: buildPreviewClipKey(jobId, highlight.highlightId),
            }),
            { expiresIn: PREVIEW_URL_EXPIRES_IN }
          );
          return {
            ...highlight,
            previewUrl,
          };
        } catch (error) {
          console.error('見どころプレビューURLの生成に失敗しました', {
            jobId,
            highlightId: highlight.highlightId,
            error,
          });
          return {
            ...highlight,
          };
        }
      })
    );

    return NextResponse.json({ highlights: enrichedHighlights });
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
