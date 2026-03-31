import { DynamoDBHighlightRepository } from '@nagiyu/quick-clip-core';
import { NextResponse } from 'next/server';
import { InvokeCommand } from '@aws-sdk/client-lambda';
import { DOMAIN_ERROR_MESSAGES, HighlightDomainService } from '@/lib/server/domain-services';
import {
  getZipGeneratorFunctionName,
  getDynamoDBDocumentClient,
  getLambdaClient,
  getTableName,
} from '@/lib/server/aws';

const ERROR_MESSAGES = {
  JOB_NOT_FOUND: '指定されたジョブが見つかりません',
  NO_ACCEPTED_HIGHLIGHTS: '採用された見どころがありません',
  CLIP_GENERATION_INCOMPLETE: '採用された見どころのクリップ生成が完了していません',
  ZIP_GENERATION_FAILED: 'ダウンロードファイルの生成に失敗しました',
  INTERNAL_SERVER_ERROR: 'ダウンロードの準備に失敗しました',
} as const;

type ZipGeneratorResponse = {
  downloadUrl: string;
};

const parseZipGeneratorResponse = (payload: Uint8Array): ZipGeneratorResponse => {
  try {
    return JSON.parse(Buffer.from(payload).toString('utf-8')) as ZipGeneratorResponse;
  } catch {
    throw new Error(ERROR_MESSAGES.ZIP_GENERATION_FAILED);
  }
};

type RouteParams = {
  params: Promise<{
    jobId: string;
  }>;
};

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

    const lambdaResponse = await getLambdaClient().send(
      new InvokeCommand({
        FunctionName: getZipGeneratorFunctionName(),
        Payload: Buffer.from(
          JSON.stringify({
            jobId,
            highlightIds: acceptedHighlights.map((highlight) => highlight.highlightId),
          })
        ),
      })
    );
    if (!lambdaResponse.Payload) {
      throw new Error(ERROR_MESSAGES.ZIP_GENERATION_FAILED);
    }
    const zipResult = parseZipGeneratorResponse(lambdaResponse.Payload);
    if (typeof zipResult.downloadUrl !== 'string' || zipResult.downloadUrl.length === 0) {
      throw new Error(ERROR_MESSAGES.ZIP_GENERATION_FAILED);
    }

    return NextResponse.json({
      jobId,
      fileName: `${jobId}-clips.zip`,
      downloadUrl: zipResult.downloadUrl,
    });
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
    if (error instanceof Error && error.message === ERROR_MESSAGES.ZIP_GENERATION_FAILED) {
      return NextResponse.json(
        {
          error: 'ZIP_GENERATION_FAILED',
          message: ERROR_MESSAGES.ZIP_GENERATION_FAILED,
        },
        { status: 500 }
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
