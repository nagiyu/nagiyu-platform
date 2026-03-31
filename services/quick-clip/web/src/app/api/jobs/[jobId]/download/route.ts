import { DynamoDBHighlightRepository } from '@nagiyu/quick-clip-core';
import { NextResponse } from 'next/server';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SubmitJobCommand } from '@aws-sdk/client-batch';
import { DOMAIN_ERROR_MESSAGES, HighlightDomainService } from '@/lib/server/domain-services';
import {
  getAwsRegion,
  getBatchClient,
  getBatchJobDefinitionArn,
  getBatchJobQueueArn,
  getBucketName,
  getDynamoDBDocumentClient,
  getS3Client,
  getTableName,
} from '@/lib/server/aws';

const ERROR_MESSAGES = {
  JOB_NOT_FOUND: '指定されたジョブが見つかりません',
  NO_ACCEPTED_HIGHLIGHTS: '採用された見どころがありません',
  DOWNLOAD_PREPARATION_TIMEOUT: 'ダウンロードファイルの準備に時間がかかっています',
  INTERNAL_SERVER_ERROR: 'ダウンロードの準備に失敗しました',
} as const;

const ZIP_READY_RETRY_COUNT = 120;
const ZIP_READY_RETRY_INTERVAL_MS = 3000;

type S3Error = {
  name?: string;
  Code?: string;
};

const isNoSuchKeyError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const s3Error = error as S3Error;
  return s3Error.name === 'NoSuchKey' || s3Error.Code === 'NoSuchKey';
};

const wait = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const waitForZipReady = async (bucketName: string, outputKey: string): Promise<void> => {
  const s3Client = getS3Client();

  for (let retryCount = 1; retryCount <= ZIP_READY_RETRY_COUNT; retryCount += 1) {
    try {
      await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: outputKey,
        })
      );
      return;
    } catch (error) {
      if (isNoSuchKeyError(error)) {
        if (retryCount === ZIP_READY_RETRY_COUNT) {
          throw new Error(ERROR_MESSAGES.DOWNLOAD_PREPARATION_TIMEOUT);
        }
        await wait(ZIP_READY_RETRY_INTERVAL_MS);
      } else {
        throw error;
      }
    }
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

    const bucketName = getBucketName();
    const outputKey = `outputs/${jobId}/clips.zip`;

    await getBatchClient().send(
      new SubmitJobCommand({
        jobName: `quick-clip-split-${jobId}`.slice(0, 128),
        jobQueue: getBatchJobQueueArn(),
        jobDefinition: getBatchJobDefinitionArn(),
        containerOverrides: {
          environment: [
            { name: 'BATCH_COMMAND', value: 'split' },
            { name: 'JOB_ID', value: jobId },
            { name: 'DYNAMODB_TABLE_NAME', value: getTableName() },
            { name: 'S3_BUCKET', value: bucketName },
            { name: 'AWS_REGION', value: getAwsRegion() },
          ],
        },
      })
    );

    await waitForZipReady(bucketName, outputKey);

    const s3Client = getS3Client();
    return NextResponse.json({
      jobId,
      fileName: `${jobId}-clips.zip`,
      downloadUrl: await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: bucketName,
          Key: outputKey,
        }),
        { expiresIn: 3600 }
      ),
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
    if (error instanceof Error && error.message === ERROR_MESSAGES.DOWNLOAD_PREPARATION_TIMEOUT) {
      return NextResponse.json(
        {
          error: 'DOWNLOAD_PREPARATION_TIMEOUT',
          message: ERROR_MESSAGES.DOWNLOAD_PREPARATION_TIMEOUT,
        },
        { status: 503 }
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
