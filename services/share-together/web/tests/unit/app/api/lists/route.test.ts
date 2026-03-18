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

jest.mock('@nagiyu/aws', () => ({
  getDynamoDBDocumentClient: jest.fn(),
}));

jest.mock('@nagiyu/share-together-core', () => ({
  DynamoDBListRepository: jest.fn(),
  createListRepository: jest.fn(),
  ListService: jest.fn(),
}));

import { DynamoDBListRepository, ListService } from '@nagiyu/share-together-core';
import { GET, POST } from '@/app/api/lists/route';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

const mockGetSessionOrUnauthorized = getSessionOrUnauthorized as jest.MockedFunction<
  typeof getSessionOrUnauthorized
>;
const mockGetDynamoDBDocumentClient = getDynamoDBDocumentClient as jest.MockedFunction<
  typeof getDynamoDBDocumentClient
>;
const mockDynamoDBListRepository = DynamoDBListRepository as jest.MockedClass<
  typeof DynamoDBListRepository
>;
(
  jest.requireMock('@nagiyu/share-together-core') as { createListRepository: jest.Mock }
).createListRepository.mockImplementation((...args: unknown[]) =>
  mockDynamoDBListRepository(...args)
);
const mockListService = ListService as jest.MockedClass<typeof ListService>;
type SessionOrUnauthorized = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

describe('/api/lists route handlers', () => {
  const mockGetPersonalListsByUserId = jest.fn();
  const mockCreatePersonalList = jest.fn();
  const createRequest = (body: unknown): Request =>
    ({
      json: async () => body,
    }) as Request;

  beforeEach(() => {
    process.env.DYNAMODB_TABLE_NAME = 'test-share-together-main';

    mockGetDynamoDBDocumentClient.mockReturnValue({ send: jest.fn() } as ReturnType<
      typeof getDynamoDBDocumentClient
    >);

    mockDynamoDBListRepository.mockImplementation(
      () => ({}) as InstanceType<typeof DynamoDBListRepository>
    );

    mockListService.mockImplementation(
      () =>
        ({
          getPersonalListsByUserId: mockGetPersonalListsByUserId,
          createPersonalList: mockCreatePersonalList,
        }) as InstanceType<typeof ListService>
    );
  });

  afterEach(() => {
    delete process.env.DYNAMODB_TABLE_NAME;
    jest.clearAllMocks();
  });

  it('GET: 未認証の場合は401レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      status: 401,
      json: async () => ({
        error: { code: 'UNAUTHORIZED', message: '認証が必要です' },
      }),
    } as SessionOrUnauthorized);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockListService).not.toHaveBeenCalled();
  });

  it('GET: 個人リスト一覧を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    } as SessionOrUnauthorized);
    mockGetPersonalListsByUserId.mockResolvedValue([
      {
        listId: 'list-1',
        userId: 'user-1',
        name: 'デフォルトリスト',
        isDefault: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockGetPersonalListsByUserId).toHaveBeenCalledWith('user-1');
    await expect(response.json()).resolves.toEqual({
      data: {
        lists: [
          {
            listId: 'list-1',
            userId: 'user-1',
            name: 'デフォルトリスト',
            isDefault: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    });
  });

  it('POST: 個人リストを作成して返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    } as SessionOrUnauthorized);
    mockCreatePersonalList.mockResolvedValue({
      listId: 'list-2',
      userId: 'user-1',
      name: '買い物',
      isDefault: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const response = await POST(createRequest({ name: '買い物' }));

    expect(response.status).toBe(201);
    expect(mockCreatePersonalList).toHaveBeenCalledWith('user-1', '買い物');
    await expect(response.json()).resolves.toEqual({
      data: {
        listId: 'list-2',
        userId: 'user-1',
        name: '買い物',
        isDefault: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
  });

  it('POST: name が不正な場合は400を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    } as SessionOrUnauthorized);

    const response = await POST(createRequest({}));

    expect(response.status).toBe(400);
    expect(mockCreatePersonalList).not.toHaveBeenCalled();
  });

  it('POST: リスト名バリデーションエラー時は400を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    } as SessionOrUnauthorized);
    mockCreatePersonalList.mockRejectedValue(new Error(ERROR_MESSAGES.LIST_NAME_INVALID));

    const response = await POST(createRequest({ name: '不正' }));

    expect(response.status).toBe(400);
  });

  it('POST: 個人リスト上限到達時は409を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    } as SessionOrUnauthorized);
    mockCreatePersonalList.mockRejectedValue(
      new Error(ERROR_MESSAGES.PERSONAL_LIST_LIMIT_EXCEEDED)
    );

    const response = await POST(createRequest({ name: '追加リスト' }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'PERSONAL_LIST_LIMIT_EXCEEDED',
        message: ERROR_MESSAGES.PERSONAL_LIST_LIMIT_EXCEEDED,
      },
    });
  });
});
