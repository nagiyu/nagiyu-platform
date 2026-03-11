import { createHealthRoute } from '@nagiyu/nextjs';

export const GET = createHealthRoute({
  service: 'stock-tracker',
  version: '1.0.0',
});
