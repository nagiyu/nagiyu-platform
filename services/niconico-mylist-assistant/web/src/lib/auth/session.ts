import { auth } from '../../auth';
import {
  createSessionGetter,
  createTestSessionExpires,
  resolveTestUser,
} from '@nagiyu/nextjs/session';
import type { Session } from 'next-auth';

type NiconicoSession = {
  user: {
    userId: string;
    email: string;
    name: string;
    roles: string[];
  };
  expires: string;
};

const getSessionFromAuth = createSessionGetter<Session, NiconicoSession>({
  auth: auth as () => Promise<Session | null>,
  createTestSession: (overrides) => {
    const u = resolveTestUser({ defaultRoles: [], roles: overrides?.roles });
    return {
      user: {
        userId: u.id,
        email: u.email,
        name: u.name,
        roles: u.roles,
      },
      expires: createTestSessionExpires(),
    };
  },
  mapSession: (session): NiconicoSession => ({
    user: {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      roles: session.user.roles,
    },
    expires: session.expires,
  }),
});

export async function getSession(): Promise<NiconicoSession | null> {
  return getSessionFromAuth();
}
