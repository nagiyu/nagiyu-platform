import { auth } from '@nagiyu/auth-core';
import { createSessionGetter, resolveTestUser } from '@nagiyu/nextjs/session';
import type { Session } from 'next-auth';

export const getSession = createSessionGetter({
  auth: auth as () => Promise<Session | null>,
  createTestSession: () => {
    const u = resolveTestUser({ defaultRoles: ['admin'] });
    return {
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        image: u.image,
        roles: u.roles,
      },
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  },
});
