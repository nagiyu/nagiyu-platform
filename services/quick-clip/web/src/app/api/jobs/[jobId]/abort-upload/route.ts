import { AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import { NextResponse } from 'next/server';
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

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
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
  } catch (error) {
    console.error(
      '[POST /api/jobs/[jobId]/abort-upload] アップロード中断処理に失敗しました',
      error
    );
    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      },
      { status: 500 }
    );
  }
}
