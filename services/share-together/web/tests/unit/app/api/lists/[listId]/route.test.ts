jest.mock('next/server', () => {
  class MockNextResponse {
    public status: number;
    private readonly body: unknown;

    constructor(body?: unknown, init?: { status?: number }) {
      this.status = init?.status ?? 200;
      this.body = body;
    }

    public static json(body: unknown, init?: { status?: number }): MockNextResponse {
      if (init?.status === 204) {
        throw new TypeError('Response constructor: ステータスコード 204 は無効です');
      }

      return new MockNextResponse(body, init);
    }

    public async json(): Promise<unknown> {
      return this.body;
    }
  }

  return { NextResponse: MockNextResponse };
});

jest.mock('@/lib/auth/session', () => ({
  getSessionOrUnauthorized: jest.fn(),
}));

jest.mock('@nagiyu/aws', () => ({
  getDynamoDBDocumentClient: jest.fn(),
}));

jest.mock('@nagiyu/share-together-core', () => ({
  DynamoDBListRepository: jest.fn(),
  ListService: jest.fn(),
}));

import { DELETE, GET, PUT } from '@/app/api/lists/[listId]/route';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { DynamoDBListRepository, ListService } from '@nagiyu/share-together-core';

const mockGetSessionOrUnauthorized = getSessionOrUnauthorized as jest.MockedFunction<
  typeof getSessionOrUnauthorized
>;
const mockGetDynamoDBDocumentClient = getDynamoDBDocumentClient as jest.MockedFunction<
  typeof getDynamoDBDocumentClient
>;
const mockDynamoDBListRepository = DynamoDBListRepository as jest.MockedClass<
  typeof DynamoDBListRepository
>;
const mockListService = ListService as jest.MockedClass<typeof ListService>;
type SessionOrUnauthorized = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

describe('/api/lists/[listId] route handlers', () => {
  const mockGetPersonalListById = jest.fn();
  const mockUpdatePersonalList = jest.fn();
  const mockDeletePersonalList = jest.fn();

  const createRequest = (body: unknown): Request =>
    ({
      json: async () => body,
    }) as Request;
  const createContext = (listId = 'list-1'): { params: Promise<{ listId: string }> } => ({
    params: Promise.resolve({ listId }),
  });

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
          getPersonalListById: mockGetPersonalListById,
          updatePersonalList: mockUpdatePersonalList,
          deletePersonalList: mockDeletePersonalList,
        }) as InstanceType<typeof ListService>
    );
  });

  afterEach(() => {
    delete process.env.DYNAMODB_TABLE_NAME;
    jest.clearAllMocks();
  });

  it('GET: 個人リストを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    mockGetPersonalListById.mockResolvedValue({
      listId: 'list-1',
      userId: 'user-1',
      name: '買い物',
      isDefault: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const response = await GET({} as Request, createContext());

    expect(response.status).toBe(200);
    expect(mockGetPersonalListById).toHaveBeenCalledWith('user-1', 'list-1');
    await expect(response.json()).resolves.toEqual({
      data: {
        listId: 'list-1',
        userId: 'user-1',
        name: '買い物',
        isDefault: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    });
  });

  it('PUT: 個人リスト名を更新して返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    mockUpdatePersonalList.mockResolvedValue({
      listId: 'list-1',
      userId: 'user-1',
      name: '仕事',
      isDefault: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const response = await PUT(createRequest({ name: '仕事' }), createContext());

    expect(response.status).toBe(200);
    expect(mockUpdatePersonalList).toHaveBeenCalledWith('user-1', 'list-1', '仕事');
    await expect(response.json()).resolves.toEqual({
      data: {
        listId: 'list-1',
        userId: 'user-1',
        name: '仕事',
        isDefault: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    });
  });

  it('DELETE: 個人リストを削除する', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    mockDeletePersonalList.mockResolvedValue(undefined);

    const response = await DELETE({} as Request, createContext());

    expect(response.status).toBe(204);
    expect(mockDeletePersonalList).toHaveBeenCalledWith('user-1', 'list-1');
  });

  it('DELETE: デフォルトリスト削除時は DEFAULT_LIST_NOT_DELETABLE を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    mockDeletePersonalList.mockRejectedValue(new Error(ERROR_MESSAGES.DEFAULT_LIST_NOT_DELETABLE));

    const response = await DELETE({} as Request, createContext());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'DEFAULT_LIST_NOT_DELETABLE',
        message: ERROR_MESSAGES.DEFAULT_LIST_NOT_DELETABLE,
      },
    });
  });
});
