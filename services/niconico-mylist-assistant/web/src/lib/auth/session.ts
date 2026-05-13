import { auth } from '../../auth';
import { createSessionGetter } from '@nagiyu/nextjs/session';
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
  createTestSession: () => {
    const testUserId = process.env.TEST_USER_ID || 'test-user-id';
    return {
      user: {
        userId: testUserId,
        email: process.env.TEST_USER_EMAIL || 'test@example.com',
        name: process.env.TEST_USER_NAME || 'Test User',
        roles: process.env.TEST_USER_ROLES?.split(',') || [],
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
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
