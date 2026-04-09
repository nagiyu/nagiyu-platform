import { DynamoDBJobRepository, selectJobDefinition } from '@nagiyu/quick-clip-core';
import type { EmotionFilter } from '@nagiyu/quick-clip-core';
import {
  CreateMultipartUploadCommand,
  PutObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { SubmitJobCommand } from '@aws-sdk/client-batch';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
  INVALID_FILE_TYPE: 'MP4 形式の動画ファイルのみアップロードできます',
  INVALID_FILE_SIZE: 'ファイルサイズが不正です',
  MULTIPART_UPLOAD_ID_NOT_FOUND: 'マルチパートアップロード ID の取得に失敗しました',
  INTERNAL_SERVER_ERROR: 'ジョブの作成に失敗しました',
} as const;

type CreateJobRequest = {
  fileName: string;
  fileSize: number;
  contentType?: string;
  emotionFilter?: EmotionFilter;
};

const UPLOAD_URL_EXPIRES_IN = 3600;
const MULTIPART_UPLOAD_URL_EXPIRES_IN = 24 * 60 * 60;
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 * 1024;
const MULTIPART_UPLOAD_THRESHOLD_BYTES = 5 * 1024 * 1024 * 1024;
const MULTIPART_CHUNK_SIZE_BYTES = 500 * 1024 * 1024;

const isCreateJobRequest = (body: unknown): body is CreateJobRequest => {
  if (typeof body !== 'object' || body === null) {
    return false;
  }

  const request = body as Partial<CreateJobRequest>;
  if (typeof request.fileName !== 'string' || typeof request.fileSize !== 'number') {
    return false;
  }
  if (
    request.emotionFilter !== undefined &&
    !VALID_EMOTION_FILTERS.has(request.emotionFilter as string)
  ) {
    return false;
  }
  return true;
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    if (!isCreateJobRequest(body)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_REQUEST,
        },
        { status: 400 }
      );
    }

    const normalizedFileName = body.fileName.trim();
    if (
      !normalizedFileName.toLowerCase().endsWith('.mp4') ||
      (typeof body.contentType === 'string' && body.contentType !== 'video/mp4')
    ) {
      return NextResponse.json(
        {
          error: 'INVALID_FILE_TYPE',
          message: ERROR_MESSAGES.INVALID_FILE_TYPE,
        },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(body.fileSize) ||
      body.fileSize <= 0 ||
      body.fileSize > MAX_FILE_SIZE_BYTES
    ) {
      return NextResponse.json(
        {
          error: 'INVALID_FILE_SIZE',
          message: ERROR_MESSAGES.INVALID_FILE_SIZE,
        },
        { status: 400 }
      );
    }

    const jobService = new JobDomainService(
      new DynamoDBJobRepository(getDynamoDBDocumentClient(), getTableName())
    );
    const job = await jobService.createJob({
      originalFileName: normalizedFileName,
      fileSize: body.fileSize,
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
          status: job.status,
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

    const uploadUrl = await getSignedUrl(
      getS3Client(),
      new PutObjectCommand({
        Bucket: bucketName,
        Key: uploadKey,
        ContentType: 'video/mp4',
      }),
      { expiresIn: UPLOAD_URL_EXPIRES_IN }
    );

    await getBatchClient().send(
      new SubmitJobCommand({
        jobName: `quick-clip-extract-${job.jobId}`.slice(0, 128),
        jobQueue: getBatchJobQueueArn(),
        jobDefinition: `${getBatchJobDefinitionPrefix()}-${selectJobDefinition(body.fileSize)}`,
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

    return NextResponse.json(
      {
        jobId: job.jobId,
        status: job.status,
        uploadUrl,
        expiresIn: UPLOAD_URL_EXPIRES_IN,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[POST /api/jobs] ジョブの作成に失敗しました', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      },
      { status: 500 }
    );
  }
}
