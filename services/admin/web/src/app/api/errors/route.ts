import { NextResponse } from 'next/server';
import { COMMON_ERROR_MESSAGES, hasPermission } from '@nagiyu/common';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { createErrorEventReader, type ListErrorEventsQuery } from '@nagiyu/admin-core';
import { createErrorResponse } from '@nagiyu/nextjs';
import { getSession } from '@/lib/auth/session';

const ERROR_MESSAGES = {
  UNAUTHORIZED: 'ログインが必要です',
  FORBIDDEN: COMMON_ERROR_MESSAGES.FORBIDDEN,
  INVALID_REQUEST: COMMON_ERROR_MESSAGES.INVALID_REQUEST_PARAMS,
  INTERNAL_ERROR: 'エラー履歴の取得に失敗しました',
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

function parseLimit(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isValidIsoString(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session?.user) {
      return createErrorResponse(401, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);
    }
    if (!hasPermission(session.user.roles, 'errors:read')) {
      return createErrorResponse(403, 'FORBIDDEN', ERROR_MESSAGES.FORBIDDEN);
    }

    const { searchParams } = new URL(request.url);
    const query: ListErrorEventsQuery = {};

    const serviceId = searchParams.get('serviceId');
    if (serviceId) {
      query.serviceId = serviceId;
    }

    const from = searchParams.get('from');
    if (from !== null) {
      if (!isValidIsoString(from)) {
        return createErrorResponse(400, 'INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST);
      }
      query.from = from;
    }

    const to = searchParams.get('to');
    if (to !== null) {
      if (!isValidIsoString(to)) {
        return createErrorResponse(400, 'INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST);
      }
      query.to = to;
    }

    const limit = parseLimit(searchParams.get('limit'));
    if (limit !== undefined) {
      query.limit = limit;
    }

    const cursor = searchParams.get('cursor');
    if (cursor) {
      query.cursor = cursor;
    }

    const reader = getReader();
    const result = await reader.list(query);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('cursor')) {
      return createErrorResponse(400, 'INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST);
    }
    if (error instanceof Error && error.message.includes('from は to')) {
      return createErrorResponse(400, 'INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST);
    }

    console.error('エラー一覧取得 API の実行に失敗しました', { error });
    return createErrorResponse(500, 'INTERNAL_ERROR', ERROR_MESSAGES.INTERNAL_ERROR);
  }
}
