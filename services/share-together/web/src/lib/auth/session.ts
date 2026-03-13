import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { createSessionGetter } from '@nagiyu/nextjs/session';
import { auth } from '../../../auth';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

type AuthSession = {
  user?: Session['user'] & {
    id?: string;
  };
  expires?: string;
};

const getAuthSession = auth as () => Promise<AuthSession | null>;

const getSessionFromAuth = createSessionGetter<AuthSession, Session>({
  auth: getAuthSession,
  createTestSession: () => ({
    user: {
      id: process.env.TEST_USER_ID || 'test-user-id',
      email: process.env.TEST_USER_EMAIL || 'test@example.com',
      name: process.env.TEST_USER_NAME || 'Test User',
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }),
  mapSession: (session): Session => ({
    ...(session as Session),
    user: {
      id: (session.user as { id?: string })?.id || '',
      email: session.user?.email || '',
      name: session.user?.name || '',
    },
    expires: session.expires || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }),
});

export const getSession = getSessionFromAuth;

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
  const session = await getSession();
  if (!session) {
    return createUnauthorizedResponse();
  }

  return session;
}
