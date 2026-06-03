/**
 * POST /api/client-log
 *
 * クライアントで捕捉したエラーを受け取り、reportErrorEvent 経由で DynamoDB に登録する。
 * 認証済みユーザーのみ受け付ける（全ユーザー対象、未認証は弾く）。
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
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

function isValidBody(body: unknown): body is ClientLogRequest {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    isAllowedSeverity(b.severity) &&
    typeof b.title === 'string' &&
    b.title.length > 0 &&
    b.title.length <= CLIENT_LOG_MAX_TITLE_LENGTH &&
    typeof b.message === 'string' &&
    b.message.length > 0 &&
    b.message.length <= CLIENT_LOG_MAX_MESSAGE_LENGTH &&
    (b.context === undefined || (typeof b.context === 'object' && b.context !== null && !Array.isArray(b.context))) &&
    (b.occurredAt === undefined || typeof b.occurredAt === 'string')
  );
}

export const POST = withAuth(getSession, 'livetalk:chat', async (session, request: NextRequest) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: CLIENT_LOG_ERROR_MESSAGES.INVALID_REQUEST },
      { status: 400 }
    );
  }

  if (!isValidBody(body)) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: CLIENT_LOG_ERROR_MESSAGES.INVALID_REQUEST },
      { status: 400 }
    );
  }

  await reportErrorEvent({
    serviceId: 'livetalk',
    severity: body.severity,
    title: body.title,
    message: body.message,
    context: {
      userId: session.user.googleId,
      ...(body.context ?? {}),
    },
    occurredAt: body.occurredAt,
  });

  return new NextResponse(null, { status: 204 });
});
