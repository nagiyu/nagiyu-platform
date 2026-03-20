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
  DynamoDBTodoRepository: jest.fn(),
  createTodoRepository: jest.fn(),
  TodoService: jest.fn(),
}));

import {
  DynamoDBListRepository,
  DynamoDBTodoRepository,
  ListService,
  TodoService,
} from '@nagiyu/share-together-core';
import { GET, POST, SERVICE_ERROR_MESSAGES } from '@/app/api/lists/[listId]/todos/route';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';

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
const mockDynamoDBTodoRepository = DynamoDBTodoRepository as jest.MockedClass<
  typeof DynamoDBTodoRepository
>;
(
  jest.requireMock('@nagiyu/share-together-core') as { createTodoRepository: jest.Mock }
).createTodoRepository.mockImplementation((...args: unknown[]) =>
  mockDynamoDBTodoRepository(...args)
);
const mockListService = ListService as jest.MockedClass<typeof ListService>;
const mockTodoService = TodoService as jest.MockedClass<typeof TodoService>;
type SessionOrUnauthorized = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

describe('/api/lists/[listId]/todos route handlers', () => {
  const mockGetPersonalListById = jest.fn();
  const mockGetTodosByListId = jest.fn();
  const mockCreateTodo = jest.fn();

  const createRequest = (body: unknown): Request =>
    ({
      json: async () => body,
    }) as Request;

  const createContext = (listId: string): { params: Promise<{ listId: string }> } => ({
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
    mockDynamoDBTodoRepository.mockImplementation(
      () => ({}) as InstanceType<typeof DynamoDBTodoRepository>
    );

    mockListService.mockImplementation(
      () =>
        ({
          getPersonalListById: mockGetPersonalListById,
        }) as InstanceType<typeof ListService>
    );

    mockTodoService.mockImplementation(
      () =>
        ({
          getTodosByListId: mockGetTodosByListId,
          createTodo: mockCreateTodo,
        }) as InstanceType<typeof TodoService>
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

    const response = await GET({} as Request, createContext('list-1'));

    expect(response.status).toBe(401);
    expect(mockListService).not.toHaveBeenCalled();
    expect(mockTodoService).not.toHaveBeenCalled();
  });

  it('GET: ToDo一覧を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    } as SessionOrUnauthorized);
    mockGetPersonalListById.mockResolvedValue({
      listId: 'list-1',
      userId: 'user-1',
      name: '個人リスト',
      isDefault: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockGetTodosByListId.mockResolvedValue([
      {
        todoId: 'todo-1',
        listId: 'list-1',
        title: '牛乳を買う',
        isCompleted: false,
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const response = await GET({} as Request, createContext('list-1'));

    expect(response.status).toBe(200);
    expect(mockGetPersonalListById).toHaveBeenCalledWith('user-1', 'list-1');
    expect(mockGetTodosByListId).toHaveBeenCalledWith('list-1');
    await expect(response.json()).resolves.toEqual({
      data: {
        todos: [
          {
            todoId: 'todo-1',
            listId: 'list-1',
            title: '牛乳を買う',
            isCompleted: false,
            createdBy: 'user-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    });
  });

  it('GET: 指定した個人リストが見つからない場合は404を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    } as SessionOrUnauthorized);
    mockGetPersonalListById.mockRejectedValue(
      new Error(SERVICE_ERROR_MESSAGES.PERSONAL_LIST_NOT_FOUND)
    );

    const response = await GET({} as Request, createContext('list-unknown'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'NOT_FOUND',
        message: '対象のデータが見つかりません',
      },
    });
  });

  it('POST: ToDoを作成して返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    } as SessionOrUnauthorized);
    mockGetPersonalListById.mockResolvedValue({
      listId: 'list-1',
      userId: 'user-1',
      name: '個人リスト',
      isDefault: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCreateTodo.mockResolvedValue({
      todoId: 'todo-2',
      listId: 'list-1',
      title: '卵を買う',
      isCompleted: false,
      createdBy: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const response = await POST(createRequest({ title: '卵を買う' }), createContext('list-1'));

    expect(response.status).toBe(201);
    expect(mockGetPersonalListById).toHaveBeenCalledWith('user-1', 'list-1');
    expect(mockCreateTodo).toHaveBeenCalledWith('list-1', '卵を買う', 'user-1');
    await expect(response.json()).resolves.toEqual({
      data: {
        todoId: 'todo-2',
        listId: 'list-1',
        title: '卵を買う',
        isCompleted: false,
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
  });

  it('POST: title が不正な場合は400を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    } as SessionOrUnauthorized);

    const response = await POST(createRequest({}), createContext('list-1'));

    expect(response.status).toBe(400);
    expect(mockCreateTodo).not.toHaveBeenCalled();
  });
});
