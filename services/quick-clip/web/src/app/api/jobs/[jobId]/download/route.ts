import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBHighlightRepository } from '@nagiyu/quick-clip-core';
import { NextResponse } from 'next/server';
import { InvokeCommand } from '@aws-sdk/client-lambda';
import { DOMAIN_ERROR_MESSAGES, HighlightDomainService } from '@/lib/server/domain-services';
import {
  getZipGeneratorFunctionName,
  getDynamoDBDocumentClient,
  getLambdaClient,
  getTableName,
  getS3Client,
  getBucketName,
} from '@/lib/server/aws';

const ERROR_MESSAGES = {
  JOB_NOT_FOUND: '指定されたジョブが見つかりません',
  NO_ACCEPTED_HIGHLIGHTS: '採用された見どころがありません',
  CLIP_GENERATION_INCOMPLETE: '採用された見どころのクリップ生成が完了していません',
  INTERNAL_SERVER_ERROR: 'ダウンロードの準備に失敗しました',
} as const;

const ZIP_KEY = (jobId: string): string => `outputs/${jobId}/clips.zip`;
const ZIP_PRESIGNED_URL_EXPIRES_IN = 300;

type RouteParams = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
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
    } catch {
      return NextResponse.json({ status: 'PROCESSING' }, { status: 202 });
    }

    const downloadUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: bucketName,
        Key: ZIP_KEY(jobId),
      }),
      { expiresIn: ZIP_PRESIGNED_URL_EXPIRES_IN }
    );

    return NextResponse.json({
      jobId,
      fileName: `${jobId}-clips.zip`,
      downloadUrl,
    });
  } catch (error) {
    console.error('[GET /api/jobs/[jobId]/download] ZIP 確認に失敗しました', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      },
      { status: 500 }
    );
  }
}

export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { jobId } = await params;
    const highlightService = new HighlightDomainService(
      new DynamoDBHighlightRepository(getDynamoDBDocumentClient(), getTableName())
    );
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
      console.warn('[POST /api/jobs/[jobId]/download] 旧 ZIP の削除に失敗しました', deleteError);
    }

    await getLambdaClient().send(
      new InvokeCommand({
        FunctionName: getZipGeneratorFunctionName(),
        InvocationType: 'Event',
        Payload: Buffer.from(
          JSON.stringify({
            jobId,
            highlightIds: acceptedHighlights.map((highlight) => highlight.highlightId),
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

    console.error('[POST /api/jobs/[jobId]/download] ダウンロード準備に失敗しました', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      },
      { status: 500 }
    );
  }
}
