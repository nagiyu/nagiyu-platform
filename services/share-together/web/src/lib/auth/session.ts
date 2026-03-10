import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '../../../auth';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

export function createUnauthorizedResponse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'UNAUTHORIZED',
        message: ERROR_MESSAGES.UNAUTHORIZED,
      },
    },
    { status: 401 }
  );
}

export async function getSessionOrUnauthorized(): Promise<Session | NextResponse> {
  if (process.env.SKIP_AUTH_CHECK === 'true') {
    return {
      user: {
        id: process.env.TEST_USER_ID || 'test-user-id',
        email: process.env.TEST_USER_EMAIL || 'test@example.com',
        name: process.env.TEST_USER_NAME || 'Test User',
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  const session = await auth();

  if (!session?.user) {
    return createUnauthorizedResponse();
  }

  return session;
}
