import { createHealthRoute } from '@nagiyu/nextjs';

export const GET = createHealthRoute({
  service: 'niconico-mylist-assistant',
});
