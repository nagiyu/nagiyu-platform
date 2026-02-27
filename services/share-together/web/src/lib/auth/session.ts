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
  const session = await auth();

  if (!session?.user) {
    return createUnauthorizedResponse();
  }

  return session;
}
