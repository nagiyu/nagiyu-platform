import { AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import { NextResponse } from 'next/server';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { getBucketName, getS3Client } from '@/lib/server/aws';

const ERROR_MESSAGES = {
  INVALID_REQUEST: COMMON_ERROR_MESSAGES.BAD_REQUEST,
  INTERNAL_SERVER_ERROR: 'アップロード中断処理に失敗しました',
} as const;

type RouteParams = {
  params: Promise<{
    jobId: string;
  }>;
};

type AbortUploadRequest = {
  uploadId: string;
};

const isAbortUploadRequest = (body: Record<string, unknown>): body is AbortUploadRequest =>
  typeof body.uploadId === 'string' && body.uploadId.trim().length > 0;

export const POST = withApiErrorReporting(
  'Web API: アップロード中断エラー',
  ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
  async (request: Request, { params }: RouteParams): Promise<NextResponse> => {
    const { jobId } = await params;
    const bodyResult = await readJsonObjectBody(request);
    if (!bodyResult.ok || !isAbortUploadRequest(bodyResult.body)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_REQUEST,
        },
        { status: 400 }
      );
    }

    const body = bodyResult.body;

    const bucketName = getBucketName();
    const uploadKey = `uploads/${jobId}/input.mp4`;
    await getS3Client().send(
      new AbortMultipartUploadCommand({
        Bucket: bucketName,
        Key: uploadKey,
        UploadId: body.uploadId,
      })
    );

    return NextResponse.json({}, { status: 200 });
  }
);
