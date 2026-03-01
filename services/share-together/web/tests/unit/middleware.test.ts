jest.mock('../../auth', () => ({
  auth: (handler: (req: unknown) => unknown) => handler,
}));

jest.mock('next/server', () => ({
  NextResponse: {
    next: () => ({ type: 'next' }),
    json: (body: unknown, init?: { status?: number }) => ({
      type: 'json',
      status: init?.status ?? 200,
      body,
    }),
    redirect: (url: URL) => ({
      type: 'redirect',
      url: url.toString(),
    }),
  },
}));

import middleware, { config } from '@/middleware';
import type { NextAuthRequest } from 'next-auth';

function createRequest({
  auth,
  href,
  pathname,
  search,
}: {
  auth: NextAuthRequest['auth'];
  href: string;
  pathname: string;
  search: string;
}): NextAuthRequest {
  return {
    auth,
    nextUrl: {
      href,
      pathname,
      search,
    },
  } as unknown as NextAuthRequest;
}

describe('middleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('未認証時に Auth サービスのサインインへリダイレクトする', () => {
    process.env.NEXT_PUBLIC_AUTH_URL = 'https://dev-auth.nagiyu.com';
    process.env.APP_URL = 'https://dev-share-together.nagiyu.com';

    const response = middleware(createRequest({
      auth: null,
      href: 'https://dev-share-together.nagiyu.com/groups?tab=all',
      pathname: '/groups',
      search: '?tab=all',
    }));

    expect(response).toEqual({
      type: 'redirect',
      url: 'https://dev-auth.nagiyu.com/signin?callbackUrl=https%3A%2F%2Fdev-share-together.nagiyu.com%2Fgroups%3Ftab%3Dall',
    });
  });

  it('認証済みユーザーはそのまま通過する', () => {
    const response = middleware(createRequest({
      auth: { user: { id: 'user-1' } },
      href: 'https://dev-share-together.nagiyu.com/',
      pathname: '/',
      search: '',
    }));

    expect(response).toEqual({ type: 'next' });
  });

  it('SKIP_AUTH_CHECK=true の場合は未認証でも通過する', () => {
    process.env.SKIP_AUTH_CHECK = 'true';

    const response = middleware(createRequest({
      auth: null,
      href: 'https://dev-share-together.nagiyu.com/groups',
      pathname: '/groups',
      search: '',
    }));

    expect(response).toEqual({ type: 'next' });
  });

  it('Auth サービス URL 未設定時は 500 を返す', () => {
    delete process.env.NEXT_PUBLIC_AUTH_URL;
    delete process.env.NEXTAUTH_URL;
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = middleware(createRequest({
      auth: null,
      href: 'https://dev-share-together.nagiyu.com/groups',
      pathname: '/groups',
      search: '',
    }));

    expect(response).toEqual({
      type: 'json',
      status: 500,
      body: { error: 'サーバーエラーが発生しました' },
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('NEXT_PUBLIC_AUTH_URL または NEXTAUTH_URL が設定されていません');
    consoleErrorSpy.mockRestore();
  });

  it('APP_URL 未設定時はリクエスト URL を callbackUrl に利用する', () => {
    process.env.NEXT_PUBLIC_AUTH_URL = 'https://dev-auth.nagiyu.com';
    delete process.env.APP_URL;

    const response = middleware(createRequest({
      auth: null,
      href: 'https://localhost:3000/groups?tab=all',
      pathname: '/groups',
      search: '?tab=all',
    }));

    expect(response).toEqual({
      type: 'redirect',
      url: 'https://dev-auth.nagiyu.com/signin?callbackUrl=https%3A%2F%2Flocalhost%3A3000%2Fgroups%3Ftab%3Dall',
    });
  });

  it('matcher が API と静的ファイルを除外している', () => {
    expect(config.matcher).toEqual([
      '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|icon-192x192.png|icon-512x512.png|sw.js).*)',
    ]);
  });
});
