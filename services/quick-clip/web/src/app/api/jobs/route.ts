import { createJobRepository } from '@nagiyu/quick-clip-core';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import type { EmotionFilter } from '@nagiyu/quick-clip-core';
import { CreateMultipartUploadCommand, UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedUploadUrl } from '@nagiyu/aws';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import { NextResponse } from 'next/server';
import { getBucketName, getS3Client } from '@/lib/server/aws';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { VALID_EMOTION_FILTERS } from '@/lib/server/emotion-filter';
import { JobDomainService } from '@/lib/server/domain-services';
import { submitExtractJob } from '@/lib/server/submit-extract-job';
import {
  UPLOAD_VALIDATION_ERROR_MESSAGES,
  isValidFileSize,
  isValidMp4File,
} from '@/lib/upload-validation';

const ERROR_MESSAGES = {
  INVALID_REQUEST: COMMON_ERROR_MESSAGES.BAD_REQUEST,
  INVALID_FILE_TYPE: UPLOAD_VALIDATION_ERROR_MESSAGES.INVALID_FILE_TYPE,
  INVALID_FILE_SIZE: UPLOAD_VALIDATION_ERROR_MESSAGES.INVALID_FILE_SIZE,
  INVALID_DURATION: '動画の再生時間が不正です',
  MULTIPART_UPLOAD_ID_NOT_FOUND: 'マルチパートアップロード ID の取得に失敗しました',
  INTERNAL_SERVER_ERROR: 'ジョブの作成に失敗しました',
} as const;

type CreateJobRequest = {
  fileName: string;
  fileSize: number;
  contentType?: string;
  emotionFilter?: EmotionFilter;
  durationSec?: number;
};

const UPLOAD_URL_EXPIRES_IN = 3600;
const MULTIPART_UPLOAD_URL_EXPIRES_IN = 24 * 60 * 60;
const MULTIPART_UPLOAD_THRESHOLD_BYTES = 100 * 1024 * 1024;
const MULTIPART_CHUNK_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_DURATION_SEC = 24 * 60 * 60;

const isCreateJobRequest = (body: Record<string, unknown>): body is CreateJobRequest => {
  if (typeof body.fileName !== 'string' || typeof body.fileSize !== 'number') {
    return false;
  }
  if (body.contentType !== undefined && typeof body.contentType !== 'string') {
    return false;
  }
  if (
    body.emotionFilter !== undefined &&
    (typeof body.emotionFilter !== 'string' || !VALID_EMOTION_FILTERS.has(body.emotionFilter))
  ) {
    return false;
  }
  if (body.durationSec !== undefined && typeof body.durationSec !== 'number') {
    return false;
  }
  return true;
};

export const POST = withApiErrorReporting(
  'Web API: ジョブ作成エラー',
  ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
  async (request: Request): Promise<NextResponse> => {
    const bodyResult = await readJsonObjectBody(request);
    if (!bodyResult.ok || !isCreateJobRequest(bodyResult.body)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_REQUEST,
        },
        { status: 400 }
      );
    }
    const body = bodyResult.body;

    const normalizedFileName = body.fileName.trim();
    if (!isValidMp4File(normalizedFileName, body.contentType)) {
      return NextResponse.json(
        {
          error: 'INVALID_FILE_TYPE',
          message: ERROR_MESSAGES.INVALID_FILE_TYPE,
        },
        { status: 400 }
      );
    }

    if (!isValidFileSize(body.fileSize)) {
      return NextResponse.json(
        {
          error: 'INVALID_FILE_SIZE',
          message: ERROR_MESSAGES.INVALID_FILE_SIZE,
        },
        { status: 400 }
      );
    }

    if (
      body.durationSec !== undefined &&
      (!Number.isFinite(body.durationSec) ||
        body.durationSec <= 0 ||
        body.durationSec > MAX_DURATION_SEC)
    ) {
      return NextResponse.json(
        {
          error: 'INVALID_DURATION',
          message: ERROR_MESSAGES.INVALID_DURATION,
        },
        { status: 400 }
      );
    }

    const jobService = new JobDomainService(createJobRepository());
    const job = await jobService.createJob({
      originalFileName: normalizedFileName,
      fileSize: body.fileSize,
      ...(body.durationSec !== undefined ? { durationSec: body.durationSec } : {}),
    });

    const bucketName = getBucketName();
    const uploadKey = `uploads/${job.jobId}/input.mp4`;

    if (body.fileSize >= MULTIPART_UPLOAD_THRESHOLD_BYTES) {
      const s3Client = getS3Client();
      const createMultipartUploadResponse = await s3Client.send(
        new CreateMultipartUploadCommand({
          Bucket: bucketName,
          Key: uploadKey,
          ContentType: 'video/mp4',
        })
      );

      const uploadId = createMultipartUploadResponse.UploadId;
      if (!uploadId) {
        return NextResponse.json(
          {
            error: 'MULTIPART_UPLOAD_ID_NOT_FOUND',
            message: ERROR_MESSAGES.MULTIPART_UPLOAD_ID_NOT_FOUND,
          },
          { status: 500 }
        );
      }

      const partCount = Math.ceil(body.fileSize / MULTIPART_CHUNK_SIZE_BYTES);
      const uploadUrls = await Promise.all(
        Array.from({ length: partCount }, (_, index) =>
          getSignedUrl(
            s3Client,
            new UploadPartCommand({
              Bucket: bucketName,
              Key: uploadKey,
              UploadId: uploadId,
              PartNumber: index + 1,
            }),
            { expiresIn: MULTIPART_UPLOAD_URL_EXPIRES_IN }
          )
        )
      );

      return NextResponse.json(
        {
          jobId: job.jobId,
          multipart: {
            uploadId,
            uploadUrls,
            chunkSize: MULTIPART_CHUNK_SIZE_BYTES,
          },
          expiresIn: MULTIPART_UPLOAD_URL_EXPIRES_IN,
        },
        { status: 201 }
      );
    }

    const uploadUrl = await createPresignedUploadUrl(
      {
        bucketName,
        key: uploadKey,
        contentType: 'video/mp4',
        expiresIn: UPLOAD_URL_EXPIRES_IN,
      },
      getS3Client()
    );

    const batchJobId = await submitExtractJob({
      jobId: job.jobId,
      fileSize: body.fileSize,
      durationSec: body.durationSec,
      emotionFilter: body.emotionFilter,
    });

    await jobService.updateBatchJobId(job.jobId, batchJobId);

    return NextResponse.json(
      {
        jobId: job.jobId,
        uploadUrl,
        expiresIn: UPLOAD_URL_EXPIRES_IN,
      },
      { status: 201 }
    );
  }
);
