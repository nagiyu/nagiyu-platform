jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/auth/session', () => ({
  getSessionOrUnauthorized: jest.fn(),
}));

jest.mock('@nagiyu/share-together-core', () => ({
  createUserRepository: jest.fn(),
  createGroupRepository: jest.fn(),
  createMembershipRepository: jest.fn(),
  createListRepository: jest.fn(),
  createTodoRepository: jest.fn(),
  resetInMemoryRepositories: jest.fn(),
}));

import { POST, DELETE } from '@/app/api/test/reset/route';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { resetInMemoryRepositories } from '@nagiyu/share-together-core';

const mockGetSessionOrUnauthorized = getSessionOrUnauthorized as jest.MockedFunction<
  typeof getSessionOrUnauthorized
>;
const mockResetInMemoryRepositories = resetInMemoryRepositories as jest.MockedFunction<
  typeof resetInMemoryRepositories
>;

type SessionOrUnauthorized = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

const createRequest = (contentLength: string = '0', body?: unknown): Request =>
  ({
    headers: { get: (name: string) => (name === 'content-length' ? contentLength : null) },
    json: async () => body,
  }) as unknown as Request;

describe('POST /api/test/reset', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, USE_IN_MEMORY_DB: 'true' };
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com', name: 'テストユーザー' },
    } as SessionOrUnauthorized);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('テストモード以外は 404 を { error: { code, message } } 形式で返す', async () => {
    process.env.USE_IN_MEMORY_DB = 'false';

    const response = await POST(createRequest());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'NOT_FOUND', message: '対象のデータが見つかりません' },
    });
  });

  it('リセットに成功した場合は success: true を返す', async () => {
    const response = await POST(createRequest());

    expect(mockResetInMemoryRepositories).toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { success: true } });
  });

  it('例外発生時は 500 を { error: { code, message } } 形式で返す', async () => {
    mockGetSessionOrUnauthorized.mockRejectedValue(new Error('予期しないエラー'));

    const response = await POST(createRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'サーバーエラーが発生しました' },
    });
  });
});

describe('DELETE /api/test/reset', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, USE_IN_MEMORY_DB: 'true' };
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com', name: 'テストユーザー' },
    } as SessionOrUnauthorized);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('テストモード以外は 404 を { error: { code, message } } 形式で返す', async () => {
    process.env.USE_IN_MEMORY_DB = 'false';

    const response = await DELETE();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'NOT_FOUND', message: '対象のデータが見つかりません' },
    });
  });

  it('リセットに成功した場合は success: true を返す', async () => {
    const response = await DELETE();

    expect(mockResetInMemoryRepositories).toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { success: true } });
  });

  it('例外発生時は 500 を { error: { code, message } } 形式で返す', async () => {
    mockGetSessionOrUnauthorized.mockRejectedValue(new Error('予期しないエラー'));

    const response = await DELETE();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'サーバーエラーが発生しました' },
    });
  });
});
