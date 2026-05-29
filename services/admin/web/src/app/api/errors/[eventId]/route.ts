import { NextResponse } from 'next/server';
import { COMMON_ERROR_MESSAGES, hasPermission, toErrorMessage } from '@nagiyu/common';
import { getDynamoDBDocumentClient, reportErrorEvent } from '@nagiyu/aws';
import { createErrorEventReader } from '@nagiyu/admin-core';
import { createErrorResponse } from '@nagiyu/nextjs';
import { getSession } from '@/lib/auth/session';

const ERROR_MESSAGES = {
  UNAUTHORIZED: 'ログインが必要です',
  FORBIDDEN: COMMON_ERROR_MESSAGES.FORBIDDEN,
  INVALID_REQUEST: COMMON_ERROR_MESSAGES.INVALID_REQUEST_PARAMS,
  NOT_FOUND: '指定されたエラーは見つかりません',
  INTERNAL_ERROR: 'エラー詳細の取得に失敗しました',
  ERROR_EVENTS_TABLE_NAME_REQUIRED: 'ERROR_EVENTS_TABLE_NAME が設定されていません',
} as const;

function getReader() {
  const docClient =
    process.env.USE_IN_MEMORY_DB === 'true' ? undefined : getDynamoDBDocumentClient();
  const tableName = process.env.ERROR_EVENTS_TABLE_NAME;

  if (!docClient) {
    return createErrorEventReader(undefined, undefined);
  }

  if (!tableName) {
    throw new Error(ERROR_MESSAGES.ERROR_EVENTS_TABLE_NAME_REQUIRED);
  }

  return createErrorEventReader(docClient, tableName);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session?.user) {
      return createErrorResponse(401, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);
    }
    if (!hasPermission(session.user.roles, 'errors:read')) {
      return createErrorResponse(403, 'FORBIDDEN', ERROR_MESSAGES.FORBIDDEN);
    }

    const { eventId } = await params;
    const { searchParams } = new URL(request.url);
    const occurredAt = searchParams.get('at');
    const serviceId = searchParams.get('serviceId');

    if (!eventId || !occurredAt || !serviceId) {
      return createErrorResponse(400, 'INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST);
    }

    const reader = getReader();
    const event = await reader.findById(eventId, occurredAt, serviceId);

    if (!event) {
      return createErrorResponse(404, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND);
    }

    return NextResponse.json(event, { status: 200 });
  } catch (error) {
    console.error('エラー詳細取得 API の実行に失敗しました', { error });
    await reportErrorEvent({
      serviceId: 'admin',
      severity: 'error',
      title: 'エラー詳細取得 API の実行に失敗しました',
      message: toErrorMessage(error),
      context: {
        endpoint: 'GET /api/errors/[eventId]',
        errorStack: error instanceof Error ? error.stack : undefined,
      },
    });
    return createErrorResponse(500, 'INTERNAL_ERROR', ERROR_MESSAGES.INTERNAL_ERROR);
  }
}
