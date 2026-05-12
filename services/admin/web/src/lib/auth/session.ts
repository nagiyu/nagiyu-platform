import { auth } from '../../auth';
import { createSessionGetter } from '@nagiyu/nextjs/session';
import type { Session } from 'next-auth';

const TEST_SESSION_DEFAULTS = {
  USER_ID: 'test-user-id',
  USER_EMAIL: 'test@example.com',
  USER_NAME: 'Test User',
} as const;

export const getSession = createSessionGetter({
  auth: auth as () => Promise<Session | null>,
  createTestSession: () => ({
    user: {
      id: process.env.TEST_USER_ID || TEST_SESSION_DEFAULTS.USER_ID,
      email: process.env.TEST_USER_EMAIL || TEST_SESSION_DEFAULTS.USER_EMAIL,
      name: process.env.TEST_USER_NAME || TEST_SESSION_DEFAULTS.USER_NAME,
      image: process.env.TEST_USER_IMAGE || undefined,
      roles: process.env.TEST_USER_ROLES?.split(',') || ['admin'],
    },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }),
});
