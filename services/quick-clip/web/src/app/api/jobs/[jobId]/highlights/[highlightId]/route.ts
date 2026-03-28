import { NextResponse } from 'next/server';
import { updatePocHighlight } from '@/lib/poc-data';
import type { HighlightStatus } from '@/lib/poc-types';

const ERROR_MESSAGES = {
  INVALID_REQUEST: '更新内容が不正です',
  HIGHLIGHT_NOT_FOUND: '指定された見どころが見つかりません',
} as const;

type UpdateHighlightRequest = {
  startSec?: number;
  endSec?: number;
  status?: HighlightStatus;
};

type RouteParams = {
  params: Promise<{
    jobId: string;
    highlightId: string;
  }>;
};

const VALID_STATUSES: ReadonlyArray<HighlightStatus> = ['accepted', 'rejected', 'pending'];

const isUpdateRequest = (body: unknown): body is UpdateHighlightRequest => {
  if (typeof body !== 'object' || body === null) {
    return false;
  }

  const request = body as UpdateHighlightRequest;
  const hasStart = request.startSec === undefined || typeof request.startSec === 'number';
  const hasEnd = request.endSec === undefined || typeof request.endSec === 'number';
  const hasStatus =
    request.status === undefined ||
    (typeof request.status === 'string' && VALID_STATUSES.includes(request.status));

  return hasStart && hasEnd && hasStatus;
};

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  // TODO(PoC): ハードコードデータ。Phase 5 の本実装時に DynamoDB 実装に差し替える
  const { jobId, highlightId } = await params;

  try {
    const body = await request.json();
    if (!isUpdateRequest(body)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_REQUEST,
        },
        { status: 400 }
      );
    }

    if (
      typeof body.startSec === 'number' &&
      typeof body.endSec === 'number' &&
      body.startSec >= body.endSec
    ) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_REQUEST,
        },
        { status: 400 }
      );
    }

    const updated = updatePocHighlight(jobId, highlightId, body);
    if (!updated) {
      return NextResponse.json(
        {
          error: 'HIGHLIGHT_NOT_FOUND',
          message: ERROR_MESSAGES.HIGHLIGHT_NOT_FOUND,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      {
        error: 'INVALID_REQUEST',
        message: ERROR_MESSAGES.INVALID_REQUEST,
      },
      { status: 400 }
    );
  }
}
