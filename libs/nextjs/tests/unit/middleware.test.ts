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

function createSession(roles: string[]): { user: { roles: string[] } } {
  return { user: { roles } };
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

  describe('requiredPermission', () => {
    it('指定 permission を保持する role があれば通過する', () => {
      const middleware = createAuthMiddleware({
        requiredPermission: 'livetalk:chat',
      });

      const response = middleware(
        createRequest('https://example.com/chat', createSession(['livetalk-user']))
      );

      expect(response).toEqual({ type: 'next' });
    });

    it('認証済みでも permission がなければページは元のパスを from に付けて /forbidden へリダイレクトする', () => {
      const middleware = createAuthMiddleware({
        requiredPermission: 'livetalk:chat',
      });

      const response = middleware(
        createRequest('https://example.com/chat?tab=1', createSession(['stock-viewer']))
      );

      expect(response).toEqual({
        type: 'redirect',
        url: 'https://example.com/forbidden?from=%2Fchat%3Ftab%3D1',
      });
    });

    it('APP_URL があればそのオリジンへリダイレクトする', () => {
      process.env.APP_URL = 'https://app.example.com';
      const middleware = createAuthMiddleware({
        requiredPermission: 'livetalk:chat',
      });

      const response = middleware(
        createRequest('http://ip-10-0-0-1.ec2.internal:3000/chat', createSession(['stock-viewer']))
      );

      expect(response).toEqual({
        type: 'redirect',
        url: 'https://app.example.com/forbidden?from=%2Fchat',
      });
    });

    it('roles が空配列でもページは /forbidden へリダイレクトする', () => {
      const middleware = createAuthMiddleware({
        requiredPermission: 'livetalk:chat',
      });

      const response = middleware(createRequest('https://example.com/chat', createSession([])));

      expect(response).toEqual({
        type: 'redirect',
        url: 'https://example.com/forbidden?from=%2Fchat',
      });
    });

    it('forbiddenPath を指定すればその path へリダイレクトする', () => {
      const middleware = createAuthMiddleware({
        requiredPermission: 'livetalk:chat',
        forbiddenPath: '/denied',
      });

      const response = middleware(
        createRequest('https://example.com/chat', createSession(['stock-viewer']))
      );

      expect(response).toEqual({
        type: 'redirect',
        url: 'https://example.com/denied?from=%2Fchat',
      });
    });

    it.each(['/api', '/api/', '/api/chat', '/api/notes/1'])(
      '%s は permission がなければ JSON 403 を返す',
      (pathname) => {
        const middleware = createAuthMiddleware({
          requiredPermission: 'livetalk:chat',
        });

        const response = middleware(
          createRequest(`https://example.com${pathname}`, createSession(['stock-viewer']))
        );

        expect(response).toEqual({
          type: 'json',
          status: 403,
          body: { error: 'FORBIDDEN', message: 'この操作を実行する権限がありません' },
        });
      }
    );

    it('/api で始まるだけのページ path は API として扱わずリダイレクトする', () => {
      const middleware = createAuthMiddleware({
        requiredPermission: 'livetalk:chat',
      });

      const response = middleware(
        createRequest('https://example.com/apiary', createSession(['stock-viewer']))
      );

      expect(response).toEqual({
        type: 'redirect',
        url: 'https://example.com/forbidden?from=%2Fapiary',
      });
    });

    it('onForbidden を指定すればその戻り値を返す', () => {
      process.env.APP_URL = 'https://app.example.com';
      const middleware = createAuthMiddleware({
        requiredPermission: 'livetalk:chat',
        onForbidden: () =>
          ({ type: 'redirect', url: 'https://auth.example.com/signin' }) as unknown as never,
      });

      const response = middleware(
        createRequest('https://example.com/chat', createSession(['stock-viewer']))
      );

      expect(response).toEqual({
        type: 'redirect',
        url: 'https://auth.example.com/signin',
      });
    });

    it('onForbidden は API パスでも forbiddenPath より優先される', () => {
      const middleware = createAuthMiddleware({
        requiredPermission: 'livetalk:chat',
        forbiddenPath: '/denied',
        onForbidden: () => ({ type: 'custom' }) as unknown as never,
      });

      const response = middleware(
        createRequest('https://example.com/api/chat', createSession(['stock-viewer']))
      );

      expect(response).toEqual({ type: 'custom' });
    });

    it('未認証の場合は permission チェックを経由せずサインインへリダイレクトする', () => {
      process.env.APP_URL = 'https://app.example.com';
      const middleware = createAuthMiddleware({
        requiredPermission: 'livetalk:chat',
        getSignInBaseUrl: () => 'https://auth.example.com',
      });

      const response = middleware(createRequest('https://example.com/chat'));

      expect(response).toEqual({
        type: 'redirect',
        url: 'https://auth.example.com/signin?callbackUrl=https%3A%2F%2Fapp.example.com%2Fchat',
      });
    });

    it('publicPaths は permission チェックなしで通過する', () => {
      const middleware = createAuthMiddleware({
        publicPaths: ['/'],
        requiredPermission: 'livetalk:chat',
      });

      const response = middleware(createRequest('https://example.com/'));

      expect(response).toEqual({ type: 'next' });
    });
  });
});
