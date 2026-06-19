/**
 * @jest-environment node
 */

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    handlers: {
      GET: mockGet,
      POST: mockPost,
    },
    auth: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  })),
}));

import { GET } from '@/app/api/auth/[...nextauth]/route';

describe('/api/auth/[...nextauth] route', () => {
  it('NextAuth GET handler を公開する', () => {
    expect(GET).toBe(mockGet);
  });

  it('POST は export しない（auth サービスへのサインアウト集約方針）', async () => {
    // POST を動的 import で確認し、export されていないことを検証する
    const routeModule = await import('@/app/api/auth/[...nextauth]/route');
    expect((routeModule as Record<string, unknown>)['POST']).toBeUndefined();
  });
});
