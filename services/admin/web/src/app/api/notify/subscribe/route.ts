import { NextResponse } from 'next/server';
import type { PushSubscription } from '@nagiyu/common';
import { requirePermission } from '@nagiyu/common';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { createErrorResponse } from '@nagiyu/nextjs';
import { createPushSubscriptionRepository } from '@nagiyu/admin-core';
import { getSession } from '@/lib/auth/session';

const ERROR_MESSAGES = {
  UNAUTHORIZED: 'ログインが必要です',
  FORBIDDEN: 'この操作を実行する権限がありません',
  INVALID_REQUEST: 'リクエストボディが不正です',
  INVALID_SUBSCRIPTION: 'サブスクリプション情報が不正です',
  INTERNAL_ERROR: 'サブスクリプション処理に失敗しました',
  DYNAMODB_TABLE_NAME_REQUIRED: 'DYNAMODB_TABLE_NAME が設定されていません',
} as const;

function isValidPushSubscription(value: unknown): value is PushSubscription {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const subscription = value as Record<string, unknown>;
  if (typeof subscription.endpoint !== 'string' || subscription.endpoint.length === 0) {
    return false;
  }

  if (!subscription.keys || typeof subscription.keys !== 'object') {
    return false;
  }

  const keys = subscription.keys as Record<string, unknown>;
  return typeof keys.p256dh === 'string' && typeof keys.auth === 'string';
}

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

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session) {
      return createErrorResponse(401, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);
    }

    try {
      requirePermission(session.user.roles, 'notifications:write');
    } catch {
      return createErrorResponse(403, 'FORBIDDEN', ERROR_MESSAGES.FORBIDDEN);
    }

    const body = await request.json();
    if (!isValidPushSubscription(body)) {
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
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse(400, 'INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST);
    }

    console.error('プッシュサブスクリプション登録 API の実行に失敗しました', { error });
    return createErrorResponse(500, 'INTERNAL_ERROR', ERROR_MESSAGES.INTERNAL_ERROR);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session) {
      return createErrorResponse(401, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);
    }

    try {
      requirePermission(session.user.roles, 'notifications:write');
    } catch {
      return createErrorResponse(403, 'FORBIDDEN', ERROR_MESSAGES.FORBIDDEN);
    }

    const body = (await request.json()) as { endpoint?: unknown };
    if (typeof body.endpoint !== 'string' || body.endpoint.length === 0) {
      return createErrorResponse(400, 'INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST);
    }

    const repository = getRepository();
    const deletedCount = await repository.deleteByEndpoint(body.endpoint);

    return NextResponse.json({ success: true, deletedCount }, { status: 200 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse(400, 'INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST);
    }

    console.error('プッシュサブスクリプション削除 API の実行に失敗しました', { error });
    return createErrorResponse(500, 'INTERNAL_ERROR', ERROR_MESSAGES.INTERNAL_ERROR);
  }
}
