import { DynamoDBJobRepository, selectJobDefinition } from '@nagiyu/quick-clip-core';
import type { EmotionFilter } from '@nagiyu/quick-clip-core';
import { SubmitJobCommand } from '@aws-sdk/client-batch';
import { CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import {
  getAwsRegion,
  getBatchClient,
  getBatchJobDefinitionPrefix,
  getBatchJobQueueArn,
  getBucketName,
  getDynamoDBDocumentClient,
  getS3Client,
  getTableName,
} from '@/lib/server/aws';
import { VALID_EMOTION_FILTERS } from '@/lib/server/emotion-filter';
import { JobDomainService } from '@/lib/server/domain-services';

const ERROR_MESSAGES = {
  INVALID_REQUEST: 'リクエストが不正です',
  JOB_NOT_FOUND: '指定されたジョブが見つかりません',
  JOB_NOT_PENDING: 'ジョブがアップロード完了可能な状態ではありません',
  INTERNAL_SERVER_ERROR: 'アップロード完了処理に失敗しました',
} as const;

type RouteParams = {
  params: Promise<{
    jobId: string;
  }>;
};

type CompletedPart = {
  PartNumber: number;
  ETag: string;
};

type CompleteUploadRequest = {
  uploadId: string;
  parts: CompletedPart[];
  emotionFilter?: EmotionFilter;
};

const isCompletedPart = (part: unknown): part is CompletedPart =>
  typeof part === 'object' &&
  part !== null &&
  (() => {
    const candidate = part as { PartNumber?: unknown; ETag?: unknown };
    return (
      Number.isInteger(candidate.PartNumber) &&
      (candidate.PartNumber as number) > 0 &&
      typeof candidate.ETag === 'string' &&
      candidate.ETag.trim().length > 0
    );
  })();

const isCompleteUploadRequest = (body: unknown): body is CompleteUploadRequest => {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const candidate = body as {
    uploadId?: unknown;
    parts?: unknown;
    emotionFilter?: unknown;
  };
  if (typeof candidate.uploadId !== 'string' || candidate.uploadId.trim().length === 0) {
    return false;
  }
  if (
    !Array.isArray(candidate.parts) ||
    candidate.parts.length === 0 ||
    !candidate.parts.every(isCompletedPart)
  ) {
    return false;
  }
  if (
    candidate.emotionFilter !== undefined &&
    !VALID_EMOTION_FILTERS.has(candidate.emotionFilter as string)
  ) {
    return false;
  }
  return true;
};

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { jobId } = await params;
    const body = await request.json();
    if (!isCompleteUploadRequest(body)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_REQUEST,
        },
        { status: 400 }
      );
    }

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
    if (job.status !== 'PENDING') {
      return NextResponse.json(
        {
          error: 'JOB_NOT_PENDING',
          message: ERROR_MESSAGES.JOB_NOT_PENDING,
        },
        { status: 409 }
      );
    }

    const bucketName = getBucketName();
    const uploadKey = `uploads/${job.jobId}/input.mp4`;
    await getS3Client().send(
      new CompleteMultipartUploadCommand({
        Bucket: bucketName,
        Key: uploadKey,
        UploadId: body.uploadId,
        MultipartUpload: {
          Parts: body.parts,
        },
      })
    );

    await getBatchClient().send(
      new SubmitJobCommand({
        jobName: `quick-clip-extract-${job.jobId}`.slice(0, 128),
        jobQueue: getBatchJobQueueArn(),
        jobDefinition: `${getBatchJobDefinitionPrefix()}-${selectJobDefinition(job.fileSize)}`,
        containerOverrides: {
          environment: [
            { name: 'BATCH_COMMAND', value: 'extract' },
            { name: 'JOB_ID', value: job.jobId },
            { name: 'DYNAMODB_TABLE_NAME', value: getTableName() },
            { name: 'S3_BUCKET', value: bucketName },
            { name: 'AWS_REGION', value: getAwsRegion() },
            { name: 'EMOTION_FILTER', value: body.emotionFilter ?? 'any' },
          ],
        },
      })
    );

    await jobService.updateStatus(job.jobId, 'PROCESSING');

    return NextResponse.json({}, { status: 200 });
  } catch (error) {
    console.error(
      '[POST /api/jobs/[jobId]/complete-upload] アップロード完了処理に失敗しました',
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
