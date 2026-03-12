import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createAuthMiddleware } from '../../src/middleware';

jest.mock('next/server', () => ({
  NextResponse: {
    next: () => ({ type: 'next' }),
    redirect: (url: URL) => ({ type: 'redirect', url: url.toString() }),
    json: (body: unknown, init?: { status?: number }) => ({
      type: 'json',
      status: init?.status ?? 200,
      body,
    }),
  },
}));

type MockRequest = {
  auth?: unknown;
  url: string;
  nextUrl: {
    pathname: string;
    search: string;
    href: string;
  };
};

function createRequest(url: string, auth?: unknown): MockRequest {
  const parsedUrl = new URL(url);
  return {
    auth,
    url,
    nextUrl: {
      pathname: parsedUrl.pathname,
      search: parsedUrl.search,
      href: parsedUrl.href,
    },
  };
}

describe('createAuthMiddleware', () => {
  beforeEach(() => {
    delete process.env.SKIP_AUTH_CHECK;
    delete process.env.APP_URL;
  });

  it('SKIP_AUTH_CHECK=true の場合は認証チェックをスキップする', () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    const middleware = createAuthMiddleware();

    const response = middleware(createRequest('https://example.com/dashboard'));

    expect(response).toEqual({ type: 'next' });
  });

  it('認証不要パスを許可する', () => {
    const middleware = createAuthMiddleware({ publicPaths: ['/'] });

    const response = middleware(createRequest('https://example.com/'));

    expect(response).toEqual({ type: 'next' });
  });

  it('未認証時に外部サインインURLへリダイレクトする', () => {
    process.env.APP_URL = 'https://app.example.com';
    const middleware = createAuthMiddleware({
      getSignInBaseUrl: () => 'https://auth.example.com',
    });

    const response = middleware(createRequest('https://example.com/dashboard?tab=1'));

    expect(response).toEqual({
      type: 'redirect',
      url: 'https://auth.example.com/signin?callbackUrl=https%3A%2F%2Fapp.example.com%2Fdashboard%3Ftab%3D1',
    });
  });

  it('サインインURL設定が不足している場合は500を返す', () => {
    const middleware = createAuthMiddleware({
      getSignInBaseUrl: () => undefined,
    });

    const response = middleware(createRequest('https://example.com/dashboard'));

    expect(response).toEqual({
      type: 'json',
      status: 500,
      body: { error: 'Authentication configuration error' },
    });
  });

  it('ローカルサインインURLにリダイレクトできる', () => {
    const middleware = createAuthMiddleware({
      isPublicPath: (pathname) => pathname.startsWith('/signin'),
      getCallbackUrl: (request) => request.nextUrl.pathname,
    });

    const response = middleware(createRequest('https://example.com/private?tab=1'));

    expect(response).toEqual({
      type: 'redirect',
      url: 'https://example.com/signin?callbackUrl=%2Fprivate',
    });
  });
});
