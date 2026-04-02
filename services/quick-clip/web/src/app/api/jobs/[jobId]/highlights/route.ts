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
import type { Highlight } from '@/types/quick-clip';

const ERROR_MESSAGES = {
  JOB_NOT_FOUND: '指定されたジョブが見つかりません',
  INTERNAL_SERVER_ERROR: '見どころ一覧の取得に失敗しました',
  INITIAL_CLIP_GENERATION_START_FAILED: '初回クリップ生成の起動に失敗しました',
  INITIAL_CLIP_GENERATION_UPDATE_FAILED: '初回クリップ生成状態の更新に失敗しました',
} as const;

const CLIP_URL_EXPIRES_IN = 3600;
const buildClipKey = (jobId: string, highlightId: string): string =>
  `outputs/${jobId}/clips/${highlightId}.mp4`;

const isInitialPendingState = (highlights: Highlight[]): boolean => {
  if (highlights.length === 0) {
    return false;
  }
  return highlights.every((highlight) => highlight.clipStatus === 'PENDING');
};

const startInitialClipGeneration = async (
  jobId: string,
  highlights: Highlight[],
  highlightService: HighlightDomainService
): Promise<Highlight[]> => {
  if (!isInitialPendingState(highlights)) {
    return highlights;
  }

  const invokeResults = await Promise.all(
    highlights.map(async (highlight) => {
      try {
        await getLambdaClient().send(
          new InvokeCommand({
            FunctionName: getClipRegenerateFunctionName(),
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
        return { highlightId: highlight.highlightId, success: true as const };
      } catch (error) {
        return { highlightId: highlight.highlightId, success: false as const, error };
      }
    })
  );

  invokeResults.forEach((result) => {
    if (!result.success) {
      console.error(`[GET /api/jobs/[jobId]/highlights] ${ERROR_MESSAGES.INITIAL_CLIP_GENERATION_START_FAILED}`, {
        jobId,
        highlightId: result.highlightId,
        error: result.error,
      });
    }
  });

  const succeededHighlightIds = new Set(
    invokeResults
      .filter(
        (result): result is { highlightId: string; success: true } => result.success === true
      )
      .map((result) => result.highlightId)
  );
  if (succeededHighlightIds.size === 0) {
    return highlights;
  }

  const targetHighlights = highlights.filter((highlight) =>
    succeededHighlightIds.has(highlight.highlightId)
  );
  const updates = await Promise.all(
    targetHighlights.map(async (highlight) => ({
      highlightId: highlight.highlightId,
      result: await (async () => {
        try {
          const updated = await highlightService.updateHighlight(jobId, highlight.highlightId, {
            clipStatus: 'GENERATING',
          });
          return { success: true as const, updated };
        } catch (error) {
          return { success: false as const, error };
        }
      })(),
    }))
  );

  updates.forEach((result) => {
    if (!result.result.success) {
      console.error(
        `[GET /api/jobs/[jobId]/highlights] ${ERROR_MESSAGES.INITIAL_CLIP_GENERATION_UPDATE_FAILED}`,
        {
          jobId,
          highlightId: result.highlightId,
          error: result.result.error,
        }
      );
    }
  });

  const updatedById = new Map(
    updates
      .filter(
        (result): result is { highlightId: string; result: { success: true; updated: Highlight } } =>
          result.result.success
      )
      .map((result) => [result.highlightId, result.result.updated])
  );

  return highlights.map((highlight) => updatedById.get(highlight.highlightId) ?? highlight);
};

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
    const highlightsWithInitialGeneration = await startInitialClipGeneration(
      jobId,
      highlights,
      highlightService
    );
    const bucketName = getBucketName();

    const results = await Promise.all(
      highlightsWithInitialGeneration.map(async (highlight) => {
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
