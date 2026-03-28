import { NextResponse } from 'next/server';
import {
  DOMAIN_ERROR_MESSAGES,
  HighlightDomainService,
  isHighlightStatus,
} from '@/lib/server/domain-services';
import { getHighlightRepository } from '@/repositories/dynamodb-highlight.repository';
import type { UpdateHighlightInput } from '@/types/quick-clip';

const ERROR_MESSAGES = {
  INVALID_REQUEST: '更新内容が不正です',
  HIGHLIGHT_NOT_FOUND: '指定された見どころが見つかりません',
  INTERNAL_SERVER_ERROR: '見どころの更新に失敗しました',
} as const;

type UpdateHighlightRequest = {
  startSec?: UpdateHighlightInput['startSec'];
  endSec?: UpdateHighlightInput['endSec'];
  status?: UpdateHighlightInput['status'];
};

type RouteParams = {
  params: Promise<{
    jobId: string;
    highlightId: string;
  }>;
};

const VALIDATION_ERROR_MESSAGES: ReadonlySet<string> = new Set([
  DOMAIN_ERROR_MESSAGES.UPDATE_FIELDS_REQUIRED,
  DOMAIN_ERROR_MESSAGES.SECOND_VALUE_INVALID,
  DOMAIN_ERROR_MESSAGES.RANGE_INVALID,
]);

const isUpdateRequest = (body: unknown): body is UpdateHighlightRequest => {
  if (typeof body !== 'object' || body === null) {
    return false;
  }

  const request = body as UpdateHighlightRequest;
  const hasStart = request.startSec === undefined || typeof request.startSec === 'number';
  const hasEnd = request.endSec === undefined || typeof request.endSec === 'number';
  const hasStatus = request.status === undefined || isHighlightStatus(request.status);

  return hasStart && hasEnd && hasStatus;
};

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { jobId, highlightId } = await params;
  const highlightService = new HighlightDomainService(getHighlightRepository());

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

    try {
      const updated = await highlightService.updateHighlight(jobId, highlightId, body);
      return NextResponse.json(updated);
    } catch (error) {
      if (error instanceof Error && error.message === DOMAIN_ERROR_MESSAGES.HIGHLIGHT_NOT_FOUND) {
        return NextResponse.json(
          {
            error: 'HIGHLIGHT_NOT_FOUND',
            message: ERROR_MESSAGES.HIGHLIGHT_NOT_FOUND,
          },
          { status: 404 }
        );
      }

      if (error instanceof Error && VALIDATION_ERROR_MESSAGES.has(error.message)) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.INVALID_REQUEST,
          },
          { status: 400 }
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
