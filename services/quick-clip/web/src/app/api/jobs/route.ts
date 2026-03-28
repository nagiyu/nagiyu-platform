import { NextResponse } from 'next/server';
import { createPocJob } from '@/lib/poc-data';

const ERROR_MESSAGES = {
  INVALID_REQUEST: 'リクエストが不正です',
  INTERNAL_SERVER_ERROR: 'ジョブの作成に失敗しました',
} as const;

type CreateJobRequest = {
  fileName: string;
  fileSize: number;
};

const isCreateJobRequest = (body: unknown): body is CreateJobRequest => {
  if (typeof body !== 'object' || body === null) {
    return false;
  }

  const request = body as Partial<CreateJobRequest>;
  return typeof request.fileName === 'string' && typeof request.fileSize === 'number';
};

export async function POST(request: Request): Promise<NextResponse> {
  // TODO(PoC): ハードコードデータ。Phase 5 の本実装時に DynamoDB 実装に差し替える
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

    const job = createPocJob(body.fileName, body.fileSize);
    return NextResponse.json({
      jobId: job.jobId,
      status: job.status,
    });
  } catch {
    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      },
      { status: 500 }
    );
  }
}
