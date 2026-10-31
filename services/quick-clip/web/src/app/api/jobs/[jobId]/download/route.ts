import { DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import { createPresignedDownloadUrl } from '@nagiyu/aws';
import { createHighlightRepository } from '@nagiyu/quick-clip-core';
import { NextResponse } from 'next/server';
import { InvokeCommand } from '@aws-sdk/client-lambda';
import { errorReporter, withApiErrorReporting } from '@/lib/api-error-reporting';
import { DOMAIN_ERROR_MESSAGES, HighlightDomainService } from '@/lib/server/domain-services';
import {
  getZipGeneratorFunctionName,
  getLambdaClient,
  getS3Client,
  getBucketName,
} from '@/lib/server/aws';

const ERROR_MESSAGES = {
  JOB_NOT_FOUND: COMMON_ERROR_MESSAGES.JOB_NOT_FOUND,
  NO_ACCEPTED_HIGHLIGHTS: '採用された見どころがありません',
  CLIP_GENERATION_INCOMPLETE: '採用された見どころのクリップ生成が完了していません',
  CLIP_GENERATION_FAILED:
    '採用された見どころに生成に失敗したクリップがあります。リトライするか、採用を外してください',
  INTERNAL_SERVER_ERROR: 'ダウンロードの準備に失敗しました',
} as const;

const ZIP_KEY = (jobId: string): string => `outputs/${jobId}/clips.zip`;
const ZIP_PRESIGNED_URL_EXPIRES_IN = 300;

type RouteParams = {
  params: Promise<{
    jobId: string;
  }>;
};

export const GET = withApiErrorReporting(
  'Web API: ZIP 確認エラー',
  ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
  async (_request: Request, { params }: RouteParams): Promise<NextResponse> => {
    const { jobId } = await params;
    const bucketName = getBucketName();
    const s3Client = getS3Client();

    try {
      await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: ZIP_KEY(jobId),
        })
      );
    } catch (error) {
      if (error instanceof Error && (error.name === 'NoSuchKey' || error.name === 'NotFound')) {
        return NextResponse.json({ status: 'PROCESSING' }, { status: 202 });
      }
      throw error;
    }

    const downloadUrl = await createPresignedDownloadUrl(
      {
        bucketName,
        key: ZIP_KEY(jobId),
        expiresIn: ZIP_PRESIGNED_URL_EXPIRES_IN,
      },
      s3Client
    );

    return NextResponse.json({
      jobId,
      fileName: `${jobId}-clips.zip`,
      downloadUrl,
    });
  }
);

export const POST = withApiErrorReporting(
  'Web API: ダウンロード準備エラー',
  ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
  async (_request: Request, { params }: RouteParams): Promise<NextResponse> => {
    try {
      const { jobId } = await params;
      const highlightService = new HighlightDomainService(createHighlightRepository());
      const highlights = await highlightService.getHighlights(jobId);
      if (highlights.length === 0) {
        return NextResponse.json(
          {
            error: 'JOB_NOT_FOUND',
            message: ERROR_MESSAGES.JOB_NOT_FOUND,
          },
          { status: 404 }
        );
      }

      const acceptedHighlights = highlights.filter((highlight) => highlight.status === 'accepted');
      if (acceptedHighlights.length === 0) {
        return NextResponse.json(
          {
            error: 'DOWNLOAD_NOT_AVAILABLE',
            message: ERROR_MESSAGES.NO_ACCEPTED_HIGHLIGHTS,
          },
          { status: 400 }
        );
      }
      // ZIP 生成は失敗したクリップの動画を読めないため、作り始める前に断る
      const hasFailedAcceptedHighlights = acceptedHighlights.some(
        (highlight) => highlight.clipStatus === 'FAILED'
      );
      if (hasFailedAcceptedHighlights) {
        return NextResponse.json(
          {
            error: 'CLIP_GENERATION_FAILED',
            message: ERROR_MESSAGES.CLIP_GENERATION_FAILED,
          },
          { status: 409 }
        );
      }
      const hasIncompleteAcceptedHighlights = acceptedHighlights.some(
        (highlight) => highlight.clipStatus === 'PENDING' || highlight.clipStatus === 'GENERATING'
      );
      if (hasIncompleteAcceptedHighlights) {
        return NextResponse.json(
          {
            error: 'CLIP_GENERATION_INCOMPLETE',
            message: ERROR_MESSAGES.CLIP_GENERATION_INCOMPLETE,
          },
          { status: 409 }
        );
      }

      const bucketName = getBucketName();
      const s3Client = getS3Client();
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: ZIP_KEY(jobId),
          })
        );
      } catch (deleteError) {
        const isExpectedError =
          deleteError instanceof Error &&
          (deleteError.name === 'NoSuchKey' || deleteError.name === 'NotFound');
        if (!isExpectedError) {
          console.warn(
            '[POST /api/jobs/[jobId]/download] 旧 ZIP の削除に失敗しました',
            deleteError
          );
          // 失敗しても ZIP の再生成を続けるため、例外が上に届かない。ここで報告する
          await errorReporter.report('Web API: 旧 ZIP 削除エラー', deleteError, {
            context: { jobId },
            severity: 'warning',
          });
        }
      }

      await getLambdaClient().send(
        new InvokeCommand({
          FunctionName: getZipGeneratorFunctionName(),
          InvocationType: 'Event',
          Payload: Buffer.from(
            JSON.stringify({
              jobId,
              clips: acceptedHighlights.map((highlight) => ({
                highlightId: highlight.highlightId,
                order: highlight.order,
                startSec: highlight.startSec,
                endSec: highlight.endSec,
              })),
            })
          ),
        })
      );

      return NextResponse.json({ status: 'PROCESSING' }, { status: 202 });
    } catch (error) {
      if (error instanceof Error && error.message === DOMAIN_ERROR_MESSAGES.JOB_ID_REQUIRED) {
        return NextResponse.json(
          {
            error: 'JOB_NOT_FOUND',
            message: ERROR_MESSAGES.JOB_NOT_FOUND,
          },
          { status: 404 }
        );
      }

      throw error;
    }
  }
);
