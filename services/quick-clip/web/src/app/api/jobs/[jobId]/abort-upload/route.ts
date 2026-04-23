import { AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { getBucketName, getS3Client } from '@/lib/server/aws';

const ERROR_MESSAGES = {
  INVALID_REQUEST: 'リクエストが不正です',
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

const isAbortUploadRequest = (body: unknown): body is AbortUploadRequest => {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const candidate = body as { uploadId?: unknown };
  return typeof candidate.uploadId === 'string' && candidate.uploadId.trim().length > 0;
};

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { jobId } = await params;
    const body = await request.json();
    if (!isAbortUploadRequest(body)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_REQUEST,
        },
        { status: 400 }
      );
    }

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
