import { NextResponse } from 'next/server';
import { getPocDownloadUrl, getPocHighlights } from '@/lib/poc-data';

const ERROR_MESSAGES = {
  JOB_NOT_FOUND: '指定されたジョブが見つかりません',
  NO_ACCEPTED_HIGHLIGHTS: '採用された見どころがありません',
} as const;

type RouteParams = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  const downloadUrl = getPocDownloadUrl(jobId);

  if (downloadUrl === null) {
    return NextResponse.json(
      {
        error: 'DOWNLOAD_NOT_AVAILABLE',
        message: ERROR_MESSAGES.NO_ACCEPTED_HIGHLIGHTS,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    jobId,
    fileName: `${jobId}-clips.zip`,
    downloadUrl,
  });
}
