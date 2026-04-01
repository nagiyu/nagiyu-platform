import { DynamoDBHighlightRepository, DynamoDBJobRepository } from '@nagiyu/quick-clip-core';
import { NextResponse } from 'next/server';
import { InvokeCommand } from '@aws-sdk/client-lambda';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  getBucketName,
  getClipRegenerateFunctionName,
  getDynamoDBDocumentClient,
  getLambdaClient,
  getS3Client,
  getTableName,
} from '@/lib/server/aws';
import { HighlightDomainService, JobDomainService } from '@/lib/server/domain-services';

const ERROR_MESSAGES = {
  JOB_NOT_FOUND: '指定されたジョブが見つかりません',
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
    const lambdaClient = getLambdaClient();
    const clipRegenerateFunctionName = getClipRegenerateFunctionName();

    const results = await Promise.all(
      highlights.map(async (highlight) => {
        if (highlight.clipStatus === 'PENDING') {
          await lambdaClient.send(
            new InvokeCommand({
              FunctionName: clipRegenerateFunctionName,
              InvocationType: 'Event',
              Payload: Buffer.from(
                JSON.stringify({
                  jobId,
                  highlightId: highlight.highlightId,
                  startSec: highlight.startSec,
                  endSec: highlight.endSec,
                })
              ),
            })
          );
          const updated = await highlightService.updateHighlight(jobId, highlight.highlightId, {
            clipStatus: 'GENERATING',
          });
          return { ...updated, clipUrl: undefined };
        }

        if (highlight.clipStatus === 'GENERATED') {
          const clipUrl = await getSignedUrl(
            getS3Client(),
            new GetObjectCommand({
              Bucket: bucketName,
              Key: buildClipKey(jobId, highlight.highlightId),
            }),
            { expiresIn: CLIP_URL_EXPIRES_IN }
          );
          return { ...highlight, clipUrl };
        }

        return { ...highlight, clipUrl: undefined };
      })
    );

    return NextResponse.json({ highlights: results });
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
