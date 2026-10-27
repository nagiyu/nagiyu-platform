import { auth } from '../../auth';
import { createSessionGetter } from '@nagiyu/nextjs/session';
import type { Session } from '@nagiyu/common';

export const getSession = createSessionGetter({
  auth: auth as () => Promise<Session | null>,
});
