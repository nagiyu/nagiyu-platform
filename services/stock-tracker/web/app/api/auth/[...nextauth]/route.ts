import { handlers } from '@/auth';
import { NextRequest } from 'next/server';

async function GET(req: NextRequest) {
  if (process.env.SKIP_AUTH_CHECK === 'true' && req.nextUrl.pathname === '/api/auth/session') {
    return Response.json({
      user: {
        name: 'Test User',
        email: process.env.TEST_USER_EMAIL || 'test@example.com',
        image: null,
        roles: process.env.TEST_USER_ROLES?.split(',').map((role) => role.trim()) || ['stock-user'],
      },
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }
  return handlers.GET(req);
}

export { GET };
export const POST = handlers.POST;
