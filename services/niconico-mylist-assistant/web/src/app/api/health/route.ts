import { createHealthRoute } from '@nagiyu/nextjs';

export const GET = createHealthRoute({
  service: 'niconico-mylist-assistant',
  version: process.env.APP_VERSION || '1.0.0',
});
