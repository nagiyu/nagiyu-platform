import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import {
  createSessionGetter,
  createTestSessionExpires,
  resolveTestUser,
} from '@nagiyu/nextjs/session';
import { auth } from '../../../auth';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

const getSessionFromAuth = createSessionGetter({
  auth: auth as () => Promise<Session | null>,
  createTestSession: (overrides) => {
    const u = resolveTestUser({ defaultRoles: [], roles: overrides?.roles });
    return {
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        image: u.image,
        roles: u.roles,
      },
      expires: createTestSessionExpires(),
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
