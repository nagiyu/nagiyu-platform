import { NextResponse } from 'next/server';
import type { Session } from '@nagiyu/common';
import { createSessionGetter } from '@nagiyu/nextjs/session';
import { auth } from '../../../auth';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

export const getSession = createSessionGetter({
  auth: auth as () => Promise<Session | null>,
});

export function createUnauthorizedResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'UNAUTHORIZED',
      message: ERROR_MESSAGES.UNAUTHORIZED,
    },
    { status: 401 }
  );
}

export async function getSessionOrUnauthorized(): Promise<Session | NextResponse> {
  const session = await getSession();
  if (!session) {
    return createUnauthorizedResponse();
  }

  return session;
}
