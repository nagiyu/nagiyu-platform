import { auth } from '@nagiyu/auth-core';
import { createSessionGetter } from '@nagiyu/nextjs/session';
import type { Session } from 'next-auth';

export const getSession = createSessionGetter({
  auth: auth as () => Promise<Session | null>,
  createTestSession: () => ({
    user: {
      id: 'test-user-id',
      email: process.env.TEST_USER_EMAIL || 'test@example.com',
      name: 'Test User',
      image: undefined,
      roles: process.env.TEST_USER_ROLES?.split(',') || ['admin'],
    },
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }),
});
