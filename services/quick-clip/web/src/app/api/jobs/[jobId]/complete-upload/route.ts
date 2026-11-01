import { createJobRepository } from '@nagiyu/quick-clip-core';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import type { EmotionFilter } from '@nagiyu/quick-clip-core';
import { CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { getBucketName, getS3Client } from '@/lib/server/aws';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { VALID_EMOTION_FILTERS } from '@/lib/server/emotion-filter';
import { JobDomainService } from '@/lib/server/domain-services';
import { submitExtractJob } from '@/lib/server/submit-extract-job';

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

export const POST = withApiErrorReporting(
  'Web API: アップロード完了処理エラー',
  ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
  async (request: Request, { params }: RouteParams): Promise<NextResponse> => {
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

    const jobService = new JobDomainService(createJobRepository());
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

    const batchJobId = await submitExtractJob({
      jobId: job.jobId,
      fileSize: job.fileSize,
      durationSec: job.durationSec,
      emotionFilter: body.emotionFilter,
    });

    await jobService.updateBatchJobId(job.jobId, batchJobId);

    return NextResponse.json({}, { status: 200 });
  }
);
