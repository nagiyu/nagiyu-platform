import { NextResponse } from 'next/server';
import { COMMON_ERROR_MESSAGES, requirePermission } from '@nagiyu/common';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { createErrorResponse, readJsonObjectBody, validatePushSubscription } from '@nagiyu/nextjs';
import { createPushSubscriptionRepository } from '@nagiyu/admin-core';
import { getSession } from '@/lib/auth/session';
import { withApiErrorReporting } from '@/lib/api-error-reporting';

const ERROR_MESSAGES = {
  UNAUTHORIZED: 'ログインが必要です',
  FORBIDDEN: COMMON_ERROR_MESSAGES.FORBIDDEN,
  INVALID_REQUEST: COMMON_ERROR_MESSAGES.INVALID_REQUEST_BODY,
  INVALID_SUBSCRIPTION: 'サブスクリプション情報が不正です',
  INTERNAL_ERROR: 'サブスクリプション処理に失敗しました',
  DYNAMODB_TABLE_NAME_REQUIRED: 'DYNAMODB_TABLE_NAME が設定されていません',
} as const;

function getRepository() {
  const docClient =
    process.env.USE_IN_MEMORY_DB === 'true' ? undefined : getDynamoDBDocumentClient();

  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!docClient) {
    return createPushSubscriptionRepository(undefined, undefined);
  }

  if (!tableName) {
    throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
  }

  return createPushSubscriptionRepository(docClient, tableName);
}

export const POST = withApiErrorReporting(
  'Web API: プッシュサブスクリプション登録エラー',
  async (request: Request) => {
    const session = await getSession();
    if (!session) {
      return createErrorResponse(401, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);
    }

    try {
      requirePermission(session.user.roles, 'notifications:write');
    } catch {
      return createErrorResponse(403, 'FORBIDDEN', ERROR_MESSAGES.FORBIDDEN);
    }

    const bodyResult = await readJsonObjectBody(request);
    if (!bodyResult.ok) {
      return createErrorResponse(400, 'INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST);
    }
    const { body } = bodyResult;
    if (!validatePushSubscription(body)) {
      return createErrorResponse(400, 'INVALID_REQUEST', ERROR_MESSAGES.INVALID_SUBSCRIPTION);
    }

    const repository = getRepository();
    const saved = await repository.save({
      userId: session.user.id,
      subscription: body,
    });

    return NextResponse.json(
      { success: true, subscriptionId: saved.subscriptionId },
      { status: 200 }
    );
  },
  ERROR_MESSAGES.INTERNAL_ERROR
);

export const DELETE = withApiErrorReporting(
  'Web API: プッシュサブスクリプション削除エラー',
  async (request: Request) => {
    const session = await getSession();
    if (!session) {
      return createErrorResponse(401, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);
    }

    try {
      requirePermission(session.user.roles, 'notifications:write');
    } catch {
      return createErrorResponse(403, 'FORBIDDEN', ERROR_MESSAGES.FORBIDDEN);
    }

    const bodyResult = await readJsonObjectBody(request);
    if (!bodyResult.ok) {
      return createErrorResponse(400, 'INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST);
    }
    const { body } = bodyResult;
    if (typeof body.endpoint !== 'string' || body.endpoint.length === 0) {
      return createErrorResponse(400, 'INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST);
    }

    const repository = getRepository();
    const deletedCount = await repository.deleteByEndpoint(body.endpoint);

    return NextResponse.json({ success: true, deletedCount }, { status: 200 });
  },
  ERROR_MESSAGES.INTERNAL_ERROR
);
