import { getSession } from '@/lib/auth/session';
import { headers } from 'next/headers';

// Mock next/headers
jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

describe('getSession', () => {
  const mockHeaders = headers as jest.MockedFunction<typeof headers>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ヘッダーからセッション情報を取得できる', async () => {
    const mockHeadersMap = new Map([
      ['x-user-id', 'user-123'],
      ['x-user-email', 'test@example.com'],
      ['x-user-roles', '["admin","user"]'],
    ]);

    mockHeaders.mockResolvedValue({
      get: (key: string) => mockHeadersMap.get(key) || null,
    } as ReturnType<typeof headers>);

    const session = await getSession();

    expect(session).toEqual({
      user: {
        id: 'user-123',
        email: 'test@example.com',
        roles: ['admin', 'user'],
      },
    });
  });

  it('ユーザー ID がない場合は null を返す', async () => {
    const mockHeadersMap = new Map([
      ['x-user-email', 'test@example.com'],
      ['x-user-roles', '["admin"]'],
    ]);

    mockHeaders.mockResolvedValue({
      get: (key: string) => mockHeadersMap.get(key) || null,
    } as ReturnType<typeof headers>);

    const session = await getSession();

    expect(session).toBeNull();
  });

  it('ユーザーメールがない場合は null を返す', async () => {
    const mockHeadersMap = new Map([
      ['x-user-id', 'user-123'],
      ['x-user-roles', '["admin"]'],
    ]);

    mockHeaders.mockResolvedValue({
      get: (key: string) => mockHeadersMap.get(key) || null,
    } as ReturnType<typeof headers>);

    const session = await getSession();

    expect(session).toBeNull();
  });

  it('ユーザーロールがない場合は null を返す', async () => {
    const mockHeadersMap = new Map([
      ['x-user-id', 'user-123'],
      ['x-user-email', 'test@example.com'],
    ]);

    mockHeaders.mockResolvedValue({
      get: (key: string) => mockHeadersMap.get(key) || null,
    } as ReturnType<typeof headers>);

    const session = await getSession();

    expect(session).toBeNull();
  });

  it('すべてのヘッダーがない場合は null を返す', async () => {
    const mockHeadersMap = new Map();

    mockHeaders.mockResolvedValue({
      get: (key: string) => mockHeadersMap.get(key) || null,
    } as ReturnType<typeof headers>);

    const session = await getSession();

    expect(session).toBeNull();
  });

  it('ロールの JSON パースが正しく動作する', async () => {
    const mockHeadersMap = new Map([
      ['x-user-id', 'user-456'],
      ['x-user-email', 'admin@example.com'],
      ['x-user-roles', '["super-admin","moderator","viewer"]'],
    ]);

    mockHeaders.mockResolvedValue({
      get: (key: string) => mockHeadersMap.get(key) || null,
    } as ReturnType<typeof headers>);

    const session = await getSession();

    expect(session).toEqual({
      user: {
        id: 'user-456',
        email: 'admin@example.com',
        roles: ['super-admin', 'moderator', 'viewer'],
      },
    });
  });
});
