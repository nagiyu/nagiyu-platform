/**
 * @jest-environment node
 */

// auth() ラッパーは素通しにし、createAuthMiddleware に渡した設定の挙動を直接検証する
jest.mock('@/auth', () => ({
  auth: (handler: unknown) => handler,
}));

import middleware from '@/middleware';

type Handler = (request: unknown) => Response;
const handler = middleware as unknown as Handler;

function buildRequest(pathname: string, roles?: string[] | null, search = '') {
  const url = `https://admin.example.com${pathname}${search}`;
  return {
    auth: roles === null ? null : { user: { roles } },
    url,
    nextUrl: { pathname, search, href: url },
  };
}

describe('admin middleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      APP_URL: 'https://admin.example.com',
      NEXT_PUBLIC_AUTH_URL: 'https://auth.example.com',
    };
    delete process.env.SKIP_AUTH_CHECK;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it.each(['admin', 'user-manager'])('%s ロールは通過する', (role) => {
    const response = handler(buildRequest('/dashboard', [role]));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it.each([
    ['users:read を持たないロール', ['developer']],
    ['ロールが空', []],
    ['ロールなし', undefined],
  ])('%s は元のパス付きで /forbidden へリダイレクトする', (_label, roles) => {
    const response = handler(buildRequest('/errors', roles as string[] | undefined, '?page=2'));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') as string);
    expect(location.origin).toBe('https://admin.example.com');
    expect(location.pathname).toBe('/forbidden');
    expect(location.searchParams.get('from')).toBe('/errors?page=2');
  });

  it('/forbidden は権限がなくても通過する (リダイレクトがループしない)', () => {
    const response = handler(buildRequest('/forbidden', ['developer']));

    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('/forbidden は未ログインでも通過する', () => {
    const response = handler(buildRequest('/forbidden', null));

    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('未ログインはサインインへリダイレクトする', () => {
    const response = handler(buildRequest('/dashboard', null));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') as string);
    expect(location.origin).toBe('https://auth.example.com');
    expect(location.pathname).toBe('/signin');
  });
});
