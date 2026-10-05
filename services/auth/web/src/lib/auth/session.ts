import { auth } from '@nagiyu/auth-core';
import {
  createSessionGetter,
  createTestSessionExpires,
  resolveTestUser,
} from '@nagiyu/nextjs/session';
import type { Session } from 'next-auth';

export const getSession = createSessionGetter({
  auth: auth as () => Promise<Session | null>,
  createTestSession: (overrides) => {
    const u = resolveTestUser({ defaultRoles: ['admin'], roles: overrides?.roles });
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
