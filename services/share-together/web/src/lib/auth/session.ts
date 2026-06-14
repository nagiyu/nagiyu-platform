import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { createSessionGetter, resolveTestUser } from '@nagiyu/nextjs/session';
import { auth } from '../../../auth';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

const getSessionFromAuth = createSessionGetter({
  auth: auth as () => Promise<Session | null>,
  createTestSession: () => {
    const u = resolveTestUser({ defaultRoles: [] });
    return {
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        image: u.image,
        roles: u.roles,
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  },
});

export const getSession = getSessionFromAuth;

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
