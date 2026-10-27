import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { headers } from 'next/headers';
import type { Session } from '@nagiyu/common';
import {
  createClientSessionGetHandler,
  createSessionGetter,
  createTestSessionExpires,
  parseTestUserRoles,
  resolveTestUser,
  TEST_SESSION_TTL_MS,
  TEST_USER_ROLES_HEADER,
} from '../../src/session';

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

const mockedHeaders = headers as jest.MockedFunction<typeof headers>;

/**
 * `headers()` の戻り値（`Headers` 互換オブジェクト）を模倣する最小限のスタブを作る。
 */
function createHeadersStub(value?: string): Awaited<ReturnType<typeof headers>> {
  return {
    get: (name: string) => (name === TEST_USER_ROLES_HEADER ? (value ?? null) : null),
  } as unknown as Awaited<ReturnType<typeof headers>>;
}

describe('resolveTestUser', () => {
  const ENV_KEYS = [
    'TEST_USER_ID',
    'TEST_USER_EMAIL',
    'TEST_USER_NAME',
    'TEST_USER_IMAGE',
    'TEST_USER_ROLES',
  ] as const;

  // テスト後に環境変数を元に戻す
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

  beforeEach(() => {
    ENV_KEYS.forEach((key) => {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    });
  });

  afterEach(() => {
    ENV_KEYS.forEach((key) => {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    });
  });

  it('環境変数未設定の場合は既定値を返す', () => {
    const user = resolveTestUser();
    expect(user).toEqual({
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      image: undefined,
      roles: [],
    });
  });

  it('defaultRoles が適用される', () => {
    const user = resolveTestUser({ defaultRoles: ['admin'] });
    expect(user.roles).toEqual(['admin']);
  });

  it('環境変数を設定した場合は上書きされる', () => {
    process.env.TEST_USER_ID = 'env-user-id';
    process.env.TEST_USER_EMAIL = 'env@example.com';
    process.env.TEST_USER_NAME = 'Env User';
    process.env.TEST_USER_IMAGE = 'https://example.com/avatar.png';

    const user = resolveTestUser();
    expect(user.id).toBe('env-user-id');
    expect(user.email).toBe('env@example.com');
    expect(user.name).toBe('Env User');
    expect(user.image).toBe('https://example.com/avatar.png');
  });

  it('TEST_USER_ROLES をカンマ区切りで複数ロールに分割する', () => {
    process.env.TEST_USER_ROLES = 'admin,viewer,editor';
    const user = resolveTestUser();
    expect(user.roles).toEqual(['admin', 'viewer', 'editor']);
  });

  it('TEST_USER_ROLES が設定されている場合は defaultRoles より優先される', () => {
    process.env.TEST_USER_ROLES = 'custom-role';
    const user = resolveTestUser({ defaultRoles: ['admin'] });
    expect(user.roles).toEqual(['custom-role']);
  });

  it('TEST_USER_ROLES を trim し空要素を除去する', () => {
    process.env.TEST_USER_ROLES = ' admin , ,viewer,';
    expect(resolveTestUser().roles).toEqual(['admin', 'viewer']);
  });

  it('TEST_USER_ROLES が空文字・区切りのみの場合は defaultRoles に戻る', () => {
    process.env.TEST_USER_ROLES = '';
    expect(resolveTestUser({ defaultRoles: ['admin'] }).roles).toEqual(['admin']);
    process.env.TEST_USER_ROLES = ' , ';
    expect(resolveTestUser({ defaultRoles: ['admin'] }).roles).toEqual(['admin']);
  });

  it('options.roles は TEST_USER_ROLES と defaultRoles より優先される', () => {
    process.env.TEST_USER_ROLES = 'env-role';
    const user = resolveTestUser({ defaultRoles: ['admin'], roles: ['header-role'] });
    expect(user.roles).toEqual(['header-role']);
  });

  it('options.roles が空配列の場合は TEST_USER_ROLES にフォールバックする', () => {
    process.env.TEST_USER_ROLES = 'env-role';
    expect(resolveTestUser({ roles: [] }).roles).toEqual(['env-role']);
  });

  it('TEST_USER_IMAGE が未設定の場合は undefined', () => {
    const user = resolveTestUser();
    expect(user.image).toBeUndefined();
  });
});

describe('createSessionGetter', () => {
  const ENV_KEYS = ['SKIP_AUTH_CHECK', 'TEST_USER_ROLES'] as const;
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

  beforeEach(() => {
    ENV_KEYS.forEach((key) => {
      saved[key] = process.env[key];
      delete process.env[key];
    });
    mockedHeaders.mockReset();
    mockedHeaders.mockResolvedValue(createHeadersStub());
  });

  afterEach(() => {
    ENV_KEYS.forEach((key) => {
      if (saved[key] !== undefined) {
        process.env[key] = saved[key];
      } else {
        delete process.env[key];
      }
    });
  });

  const createAuth = () => jest.fn<() => Promise<Session | null>>();

  it('SKIP_AUTH_CHECK=true の場合は auth を呼ばず既定ロールのテストセッションを返す', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    const auth = createAuth();
    const getSession = createSessionGetter({ auth, defaultRoles: ['stock-user'] });

    const session = await getSession();

    expect(session?.user).toEqual({
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      image: undefined,
      roles: ['stock-user'],
    });
    expect(typeof session?.expires).toBe('string');
    expect(auth).not.toHaveBeenCalled();
  });

  it('defaultRoles 省略時のテストセッションのロールは空配列', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    const getSession = createSessionGetter({ auth: createAuth() });

    expect((await getSession())?.user.roles).toEqual([]);
  });

  it('TEST_USER_ROLES は既定ロールより優先される', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    process.env.TEST_USER_ROLES = 'env-role';
    const getSession = createSessionGetter({ auth: createAuth(), defaultRoles: ['stock-user'] });

    expect((await getSession())?.user.roles).toEqual(['env-role']);
  });

  it('ヘッダのロールは TEST_USER_ROLES と既定ロールより優先される', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    process.env.TEST_USER_ROLES = 'env-role';
    mockedHeaders.mockResolvedValue(createHeadersStub('stock-viewer'));
    const getSession = createSessionGetter({ auth: createAuth(), defaultRoles: ['stock-user'] });

    expect((await getSession())?.user.roles).toEqual(['stock-viewer']);
  });

  it('ヘッダの値が空白・カンマのみの場合は無視される', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    mockedHeaders.mockResolvedValue(createHeadersStub(' , ,'));
    const getSession = createSessionGetter({ auth: createAuth(), defaultRoles: ['stock-user'] });

    expect((await getSession())?.user.roles).toEqual(['stock-user']);
  });

  it('headers() が例外を投げた場合は既定ロールにフォールバックする', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    mockedHeaders.mockImplementation(() => {
      throw new Error('リクエストスコープ外での呼び出し');
    });
    const getSession = createSessionGetter({ auth: createAuth(), defaultRoles: ['stock-user'] });

    expect((await getSession())?.user.roles).toEqual(['stock-user']);
  });

  it('認証セッションが null の場合は null を返す', async () => {
    const auth = createAuth().mockResolvedValue(null);
    const getSession = createSessionGetter({ auth });

    expect(await getSession()).toBeNull();
  });

  it('認証セッションに user がない場合は null を返す', async () => {
    const auth = createAuth().mockResolvedValue({
      expires: new Date().toISOString(),
    } as unknown as Session);
    const getSession = createSessionGetter({ auth });

    expect(await getSession()).toBeNull();
  });

  it('認証済みセッションを変換せずそのまま返す', async () => {
    const mockSession: Session = {
      user: { id: 'user-2', email: 'a@example.com', name: 'A', roles: ['viewer'] },
      expires: '2026-06-01T00:00:00Z',
    };
    const auth = createAuth().mockResolvedValue(mockSession);
    const getSession = createSessionGetter({ auth, defaultRoles: ['admin'] });

    expect(await getSession()).toEqual(mockSession);
  });
});

describe('parseTestUserRoles', () => {
  it('カンマ区切りを分割し trim と空要素除去を行う', () => {
    expect(parseTestUserRoles(' a , b,,c ')).toEqual(['a', 'b', 'c']);
  });

  it.each([undefined, null, '', ' , ,'])('%p は undefined を返す', (value) => {
    expect(parseTestUserRoles(value)).toBeUndefined();
  });
});

describe('createTestSessionExpires', () => {
  it('現在時刻から 30 日後の ISO 8601 文字列を返す', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    try {
      expect(TEST_SESSION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
      expect(createTestSessionExpires()).toBe('2026-01-31T00:00:00.000Z');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('createClientSessionGetHandler', () => {
  const ENV_KEYS = ['SKIP_AUTH_CHECK', 'TEST_USER_ID', 'TEST_USER_ROLES'] as const;
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

  beforeEach(() => {
    ENV_KEYS.forEach((key) => {
      saved[key] = process.env[key];
      delete process.env[key];
    });
  });

  afterEach(() => {
    ENV_KEYS.forEach((key) => {
      if (saved[key] !== undefined) {
        process.env[key] = saved[key];
      } else {
        delete process.env[key];
      }
    });
  });

  const createRequest = (path: string, rolesHeader?: string) =>
    new Request(`http://localhost${path}`, {
      headers: rolesHeader === undefined ? {} : { [TEST_USER_ROLES_HEADER]: rolesHeader },
    });

  it('SKIP_AUTH_CHECK でない場合は元のハンドラに委譲する', async () => {
    const original = jest.fn<(req: Request) => Promise<Response>>(
      async () => new Response('original')
    );
    const handler = createClientSessionGetHandler(original, { defaultRoles: ['x'] });
    const req = createRequest('/api/auth/session', 'viewer');

    const res = await handler(req);

    expect(original).toHaveBeenCalledWith(req);
    expect(await res.text()).toBe('original');
  });

  it('パスが /api/auth/session 以外の場合は元のハンドラに委譲する', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    const original = jest.fn<(req: Request) => Promise<Response>>(
      async () => new Response('original')
    );
    const handler = createClientSessionGetHandler(original);

    const res = await handler(createRequest('/api/auth/providers'));

    expect(original).toHaveBeenCalledTimes(1);
    expect(await res.text()).toBe('original');
  });

  it('ヘッダなしの場合は TEST_USER_ROLES、なければ既定ロールで応答する', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    const original = jest.fn<(req: Request) => Promise<Response>>(
      async () => new Response('original')
    );
    const handler = createClientSessionGetHandler(original, { defaultRoles: ['stock-user'] });

    const body = await (await handler(createRequest('/api/auth/session'))).json();
    expect(body.user).toEqual({
      id: 'test-user-id',
      name: 'Test User',
      email: 'test@example.com',
      image: null,
      roles: ['stock-user'],
    });
    expect(typeof body.expires).toBe('string');

    process.env.TEST_USER_ROLES = 'stock-admin';
    const body2 = await (await handler(createRequest('/api/auth/session'))).json();
    expect(body2.user.roles).toEqual(['stock-admin']);
    expect(original).not.toHaveBeenCalled();
  });

  it('ヘッダのロールが TEST_USER_ROLES より優先され、空ヘッダは無視される', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    process.env.TEST_USER_ROLES = 'stock-admin';
    const handler = createClientSessionGetHandler(async () => new Response('original'), {
      defaultRoles: ['stock-user'],
    });

    const viewer = await (await handler(createRequest('/api/auth/session', 'stock-viewer'))).json();
    expect(viewer.user.roles).toEqual(['stock-viewer']);

    const empty = await (await handler(createRequest('/api/auth/session', ' , '))).json();
    expect(empty.user.roles).toEqual(['stock-admin']);
  });

  it('有効期限は 30 日後になる', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    const handler = createClientSessionGetHandler(async () => new Response('original'));

    const body = await (await handler(createRequest('/api/auth/session'))).json();

    const diff = new Date(body.expires).getTime() - Date.now();
    expect(Math.abs(diff - TEST_SESSION_TTL_MS)).toBeLessThan(60 * 1000);
  });
});
