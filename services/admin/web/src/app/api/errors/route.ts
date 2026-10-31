import type { NextRequest } from 'next/server';
import { COMMON_ERROR_MESSAGES, InvalidInputError, hasPermission } from '@nagiyu/common';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { createErrorEventReader, type ListErrorEventsQuery } from '@nagiyu/admin-core';
import {
  createErrorResponse,
  createPaginatedResponse,
  PaginationValidationError,
  parsePagination,
} from '@nagiyu/nextjs';
import { getSession } from '@/lib/auth/session';
import { withApiErrorReporting } from '@/lib/api-error-reporting';

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

function isValidIsoString(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export const GET = withApiErrorReporting(
  'エラー一覧取得 API の実行に失敗しました',
  async (request: NextRequest) => {
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

      const { limit, cursor } = parsePagination(request);
      query.limit = limit;
      if (cursor) {
        query.cursor = cursor;
      }

      const reader = getReader();
      const result = await reader.list(query);

      return createPaginatedResponse(result.items, result.nextCursor ?? undefined);
    } catch (error) {
      if (error instanceof PaginationValidationError) {
        return createErrorResponse(400, 'INVALID_REQUEST', error.message);
      }
      // 文言の部分一致では DynamoDB 由来など別の例外まで 400 にしてしまうため、型で判定する
      if (error instanceof InvalidInputError) {
        return createErrorResponse(400, 'INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST);
      }

      throw error;
    }
  },
  ERROR_MESSAGES.INTERNAL_ERROR
);
