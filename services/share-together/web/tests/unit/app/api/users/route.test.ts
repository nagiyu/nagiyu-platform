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

jest.mock('@/lib/aws-clients', () => ({
  getDocClient: jest.fn(),
}));

jest.mock('@/lib/repositories', () => ({
  createUserRepository: jest.fn(),
  createListRepository: jest.fn(),
}));

import { POST } from '@/app/api/users/route';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDocClient } from '@/lib/aws-clients';
import { createListRepository, createUserRepository } from '@/lib/repositories';

const mockGetSessionOrUnauthorized = getSessionOrUnauthorized as jest.MockedFunction<
  typeof getSessionOrUnauthorized
>;
const mockGetDocClient = getDocClient as jest.MockedFunction<typeof getDocClient>;
const mockCreateUserRepository = createUserRepository as jest.MockedFunction<
  typeof createUserRepository
>;
const mockCreateListRepository = createListRepository as jest.MockedFunction<
  typeof createListRepository
>;
type SessionOrUnauthorized = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

describe('POST /api/users', () => {
  const mockSend = jest.fn();
  const mockGetById = jest.fn();
  const mockUpdateUser = jest.fn();
  const mockCreateUser = jest.fn();
  const mockCreatePersonalList = jest.fn();
  let randomUuidSpy: jest.SpiedFunction<typeof crypto.randomUUID> | null = null;

  beforeEach(() => {
    process.env.DYNAMODB_TABLE_NAME = 'test-share-together-main';
    mockGetDocClient.mockReturnValue({ send: mockSend } as ReturnType<typeof getDocClient>);
    mockCreateUserRepository.mockReturnValue({
      getById: mockGetById,
      update: mockUpdateUser,
      create: mockCreateUser,
    });
    mockCreateListRepository.mockReturnValue({
      createPersonalList: mockCreatePersonalList,
    });
  });

  afterEach(() => {
    delete process.env.DYNAMODB_TABLE_NAME;
    randomUuidSpy?.mockRestore();
    randomUuidSpy = null;
    jest.clearAllMocks();
  });

  it('未認証の場合は401レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      status: 401,
      json: async () => ({
        error: { code: 'UNAUTHORIZED', message: '認証が必要です' },
      }),
    } as SessionOrUnauthorized);

    const response = await POST();

    expect(response.status).toBe(401);
    expect(mockCreateUserRepository).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('既存ユーザーの場合はプロフィールを更新して返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'updated@example.com',
        name: '更新ユーザー',
        image: 'https://example.com/new.png',
      },
    } as SessionOrUnauthorized);
    mockGetById.mockResolvedValue({
      userId: 'user-1',
      email: 'before@example.com',
      name: '更新前ユーザー',
      image: 'https://example.com/old.png',
      defaultListId: 'list-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockUpdateUser.mockResolvedValue({
      userId: 'user-1',
      email: 'updated@example.com',
      name: '更新ユーザー',
      image: 'https://example.com/new.png',
      defaultListId: 'list-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const response = await POST();

    expect(mockUpdateUser).toHaveBeenCalledWith('user-1', {
      email: 'updated@example.com',
      name: '更新ユーザー',
      image: 'https://example.com/new.png',
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: expect.objectContaining({
        userId: 'user-1',
        email: 'updated@example.com',
        name: '更新ユーザー',
        defaultListId: 'list-1',
      }),
    });
  });

  it('新規ユーザーの場合はユーザーとデフォルトリストを作成する', async () => {
    randomUuidSpy = jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('list-99');
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-new',
        email: 'new@example.com',
        name: '新規ユーザー',
        image: null,
      },
    } as SessionOrUnauthorized);
    mockGetById.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue({
      userId: 'user-new',
      email: 'new@example.com',
      name: '新規ユーザー',
      image: undefined,
      defaultListId: 'list-99',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCreatePersonalList.mockResolvedValue({
      listId: 'list-99',
      userId: 'user-new',
      name: 'デフォルトリスト',
      isDefault: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const response = await POST();

    expect(mockCreateUser).toHaveBeenCalledWith({
      userId: 'user-new',
      email: 'new@example.com',
      name: '新規ユーザー',
      image: undefined,
      defaultListId: 'list-99',
    });
    expect(mockCreatePersonalList).toHaveBeenCalledWith({
      listId: 'list-99',
      userId: 'user-new',
      name: 'デフォルトリスト',
      isDefault: true,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: expect.objectContaining({
        userId: 'user-new',
        defaultListId: 'list-99',
      }),
    });
  });
});
