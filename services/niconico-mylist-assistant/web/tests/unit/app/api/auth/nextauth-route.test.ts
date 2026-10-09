/**
 * @jest-environment node
 */

const mockHandlersGet = jest.fn();

jest.mock('@/auth', () => ({
  handlers: { GET: (req: unknown) => mockHandlersGet(req) },
}));

import { NextRequest } from 'next/server';
import * as routeModule from '@/app/api/auth/[...nextauth]/route';

const SESSION_URL = 'http://localhost:3000/api/auth/session';

describe('/api/auth/[...nextauth] route', () => {
  const originalSkipAuthCheck = process.env.SKIP_AUTH_CHECK;

  beforeEach(() => {
    mockHandlersGet.mockReset();
    delete process.env.SKIP_AUTH_CHECK;
  });

  afterAll(() => {
    if (originalSkipAuthCheck === undefined) {
      delete process.env.SKIP_AUTH_CHECK;
    } else {
      process.env.SKIP_AUTH_CHECK = originalSkipAuthCheck;
    }
  });

  it('通常時は NextAuth の GET handler へ委譲する', async () => {
    const expected = Response.json({ user: null });
    mockHandlersGet.mockResolvedValue(expected);

    const response = await routeModule.GET(new NextRequest(SESSION_URL));

    expect(mockHandlersGet).toHaveBeenCalledTimes(1);
    expect(response).toBe(expected);
  });

  it('SKIP_AUTH_CHECK=true では既定ロールなしのテストセッションを返す', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';

    const response = await routeModule.GET(new NextRequest(SESSION_URL));
    const body = await response.json();

    expect(mockHandlersGet).not.toHaveBeenCalled();
    expect(body.user.roles).toEqual([]);
  });

  it('SKIP_AUTH_CHECK=true でもロール上書きヘッダがあればそのロールを返す', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';

    const response = await routeModule.GET(
      new NextRequest(SESSION_URL, { headers: { 'x-test-user-roles': 'niconico-user' } })
    );
    const body = await response.json();

    expect(body.user.roles).toEqual(['niconico-user']);
  });

  it('POST は export しない（auth サービスへのサインアウト集約方針）', () => {
    expect((routeModule as Record<string, unknown>)['POST']).toBeUndefined();
  });
});
