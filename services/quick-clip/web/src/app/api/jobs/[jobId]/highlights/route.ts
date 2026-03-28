import { NextResponse } from 'next/server';
import { getPocHighlights } from '@/lib/poc-data';

const ERROR_MESSAGES = {
  JOB_NOT_FOUND: '指定されたジョブが見つかりません',
} as const;

type RouteParams = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  // TODO(PoC): ハードコードデータ。Phase 5 の本実装時に DynamoDB 実装に差し替える
  const { jobId } = await params;
  const highlights = getPocHighlights(jobId);

  if (!highlights) {
    return NextResponse.json(
      {
        error: 'JOB_NOT_FOUND',
        message: ERROR_MESSAGES.JOB_NOT_FOUND,
      },
      { status: 404 }
    );
  }

  return NextResponse.json({ highlights });
}
