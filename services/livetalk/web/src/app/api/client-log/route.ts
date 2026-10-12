/**
 * POST /api/client-log
 *
 * クライアントで捕捉したエラーを受け取り、reportErrorEvent 経由で DynamoDB に登録する。
 * 認証済みユーザーのみ受け付ける（全ユーザー対象、未認証は弾く）。
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readJsonObjectBody, withAuth } from '@nagiyu/nextjs';
import { reportErrorEvent } from '@nagiyu/aws';
import { getSession } from '@/lib/server/session';
import {
  CLIENT_LOG_ALLOWED_SEVERITIES,
  CLIENT_LOG_ERROR_MESSAGES,
  CLIENT_LOG_MAX_MESSAGE_LENGTH,
  CLIENT_LOG_MAX_TITLE_LENGTH,
} from './constants';

type AllowedSeverity = (typeof CLIENT_LOG_ALLOWED_SEVERITIES)[number];

interface ClientLogRequest {
  severity: AllowedSeverity;
  title: string;
  message: string;
  context?: Record<string, unknown>;
  occurredAt?: string;
}

function isAllowedSeverity(value: unknown): value is AllowedSeverity {
  return (
    typeof value === 'string' &&
    (CLIENT_LOG_ALLOWED_SEVERITIES as readonly string[]).includes(value)
  );
}

function isValidBody(b: Record<string, unknown>): b is Record<string, unknown> & ClientLogRequest {
  return (
    isAllowedSeverity(b.severity) &&
    typeof b.title === 'string' &&
    b.title.length > 0 &&
    b.title.length <= CLIENT_LOG_MAX_TITLE_LENGTH &&
    typeof b.message === 'string' &&
    b.message.length > 0 &&
    b.message.length <= CLIENT_LOG_MAX_MESSAGE_LENGTH &&
    (b.context === undefined ||
      (typeof b.context === 'object' && b.context !== null && !Array.isArray(b.context))) &&
    (b.occurredAt === undefined || typeof b.occurredAt === 'string')
  );
}

export const POST = withAuth(getSession, 'livetalk:chat', async (session, request: NextRequest) => {
  const bodyResult = await readJsonObjectBody(request);
  if (!bodyResult.ok || !isValidBody(bodyResult.body)) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: CLIENT_LOG_ERROR_MESSAGES.INVALID_REQUEST },
      { status: 400 }
    );
  }

  const body = bodyResult.body;

  await reportErrorEvent({
    serviceId: 'livetalk',
    severity: body.severity,
    title: body.title,
    message: body.message,
    context: {
      userId: session.user.id,
      ...(body.context ?? {}),
    },
    occurredAt: body.occurredAt,
  });

  return new NextResponse(null, { status: 204 });
});
