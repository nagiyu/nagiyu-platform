import { DynamoDBJobRepository, selectJobDefinition } from '@nagiyu/quick-clip-core';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import { readJsonObjectBody } from '@nagiyu/nextjs';
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
  INVALID_REQUEST: COMMON_ERROR_MESSAGES.BAD_REQUEST,
  JOB_NOT_FOUND: COMMON_ERROR_MESSAGES.JOB_NOT_FOUND,
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isCompletedPart = (part: unknown): part is CompletedPart =>
  isRecord(part) &&
  typeof part.PartNumber === 'number' &&
  Number.isInteger(part.PartNumber) &&
  part.PartNumber > 0 &&
  typeof part.ETag === 'string' &&
  part.ETag.trim().length > 0;

const isCompleteUploadRequest = (body: Record<string, unknown>): body is CompleteUploadRequest => {
  if (typeof body.uploadId !== 'string' || body.uploadId.trim().length === 0) {
    return false;
  }
  if (!Array.isArray(body.parts) || body.parts.length === 0 || !body.parts.every(isCompletedPart)) {
    return false;
  }
  if (
    body.emotionFilter !== undefined &&
    (typeof body.emotionFilter !== 'string' || !VALID_EMOTION_FILTERS.has(body.emotionFilter))
  ) {
    return false;
  }
  return true;
};

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { jobId } = await params;
    const bodyResult = await readJsonObjectBody(request);
    if (!bodyResult.ok || !isCompleteUploadRequest(bodyResult.body)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_REQUEST,
        },
        { status: 400 }
      );
    }

    const body = bodyResult.body;

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
    if (job.batchJobId !== undefined) {
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

    const submitResponse = await getBatchClient().send(
      new SubmitJobCommand({
        jobName: `quick-clip-extract-${job.jobId}`.slice(0, 128),
        jobQueue: getBatchJobQueueArn(),
        jobDefinition: `${getBatchJobDefinitionPrefix()}-${selectJobDefinition(job.fileSize, job.durationSec)}`,
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

    await jobService.updateBatchJobId(job.jobId, submitResponse.jobId!);

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
