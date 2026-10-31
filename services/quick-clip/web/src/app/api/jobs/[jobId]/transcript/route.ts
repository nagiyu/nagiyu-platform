import { createJobRepository } from '@nagiyu/quick-clip-core';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import { NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getBucketName, getS3Client } from '@/lib/server/aws';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { JobDomainService } from '@/lib/server/domain-services';
import type { TranscriptSegment } from '@/types/quick-clip';

const ERROR_MESSAGES = {
  JOB_NOT_FOUND: COMMON_ERROR_MESSAGES.JOB_NOT_FOUND,
  INTERNAL_SERVER_ERROR: '文字起こし情報の取得に失敗しました',
} as const;

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

const buildTranscriptKey = (jobId: string): string => `outputs/${jobId}/transcript.json`;

type RouteParams = {
  params: Promise<{
    jobId: string;
  }>;
};

export const GET = withApiErrorReporting(
  'Web API: 文字起こし取得エラー',
  ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
  async (_request: Request, { params }: RouteParams): Promise<NextResponse> => {
    const { jobId } = await params;
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

    const s3Client = getS3Client();
    const bucketName = getBucketName();

    try {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: buildTranscriptKey(jobId),
        })
      );

      if (!response.Body) {
        return NextResponse.json({ segments: [] });
      }

      const rawText = await response.Body.transformToString();
      const segments = JSON.parse(rawText) as TranscriptSegment[];
      return NextResponse.json({ segments });
    } catch (error) {
      if (isNoSuchKeyError(error)) {
        // transcript.json が存在しない場合はオプショナル扱いで空配列を返す
        return NextResponse.json({ segments: [] });
      }
      throw error;
    }
  }
);
