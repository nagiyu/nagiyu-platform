import { NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SubmitJobCommand } from '@aws-sdk/client-batch';
import { DOMAIN_ERROR_MESSAGES, HighlightDomainService } from '@/lib/server/domain-services';
import {
  getAwsRegion,
  getBatchClient,
  getBatchJobDefinitionArn,
  getBatchJobQueueArn,
  getBucketName,
  getS3Client,
  getTableName,
} from '@/lib/server/aws';
import { getHighlightRepository } from '@/repositories/dynamodb-highlight.repository';

const ERROR_MESSAGES = {
  JOB_NOT_FOUND: '指定されたジョブが見つかりません',
  NO_ACCEPTED_HIGHLIGHTS: '採用された見どころがありません',
  INTERNAL_SERVER_ERROR: 'ダウンロードの準備に失敗しました',
} as const;

type RouteParams = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { jobId } = await params;
    const highlightService = new HighlightDomainService(getHighlightRepository());
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
    const downloadUrl = await getSignedUrl(
      getS3Client(),
      new GetObjectCommand({
        Bucket: bucketName,
        Key: outputKey,
      }),
      { expiresIn: 3600 }
    );

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

    return NextResponse.json({
      jobId,
      fileName: `${jobId}-clips.zip`,
      downloadUrl,
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

    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      },
      { status: 500 }
    );
  }
}
