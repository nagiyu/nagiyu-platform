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
        throw new TypeError('Response constructor: Invalid response status code 204');
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
  createListRepository: jest.fn(),
  DynamoDBTodoRepository: jest.fn(),
  createTodoRepository: jest.fn(),
  TodoService: jest.fn(),
}));

import { DELETE, PUT } from '@/app/api/lists/[listId]/todos/[todoId]/route';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import {
  DynamoDBListRepository,
  DynamoDBTodoRepository,
  TodoService,
} from '@nagiyu/share-together-core';
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
const mockDynamoDBTodoRepository = DynamoDBTodoRepository as jest.MockedClass<
  typeof DynamoDBTodoRepository
>;
(
  jest.requireMock('@nagiyu/share-together-core') as { createTodoRepository: jest.Mock }
).createTodoRepository.mockImplementation((...args: unknown[]) =>
  mockDynamoDBTodoRepository(...args)
);
const mockTodoService = TodoService as jest.MockedClass<typeof TodoService>;
type SessionOrUnauthorized = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

describe('/api/lists/[listId]/todos/[todoId] route handlers', () => {
  const mockGetPersonalListById = jest.fn();
  const mockUpdateTodo = jest.fn();
  const mockDeleteTodo = jest.fn();
  const createRequest = (body: unknown): Request =>
    ({
      json: async () => body,
    }) as Request;
  const createContext = (
    listId = 'list-1',
    todoId = 'todo-1'
  ): { params: Promise<{ listId: string; todoId: string }> } => ({
    params: Promise.resolve({ listId, todoId }),
  });

  beforeEach(() => {
    process.env.DYNAMODB_TABLE_NAME = 'test-share-together-main';

    mockGetDynamoDBDocumentClient.mockReturnValue({ send: jest.fn() } as ReturnType<
      typeof getDynamoDBDocumentClient
    >);

    mockDynamoDBListRepository.mockImplementation(
      () =>
        ({
          getPersonalListById: mockGetPersonalListById,
        }) as InstanceType<typeof DynamoDBListRepository>
    );
    mockDynamoDBTodoRepository.mockImplementation(
      () => ({}) as InstanceType<typeof DynamoDBTodoRepository>
    );
    mockGetPersonalListById.mockResolvedValue({
      listId: 'list-1',
      userId: 'user-1',
      name: '個人リスト',
      isDefault: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    mockTodoService.mockImplementation(
      () =>
        ({
          updateTodo: mockUpdateTodo,
          deleteTodo: mockDeleteTodo,
        }) as InstanceType<typeof TodoService>
    );
  });

  afterEach(() => {
    delete process.env.DYNAMODB_TABLE_NAME;
    jest.clearAllMocks();
  });

  it('PUT: ToDo を更新して返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    } as SessionOrUnauthorized);
    mockUpdateTodo.mockResolvedValue({
      todoId: 'todo-1',
      listId: 'list-1',
      title: '更新後',
      isCompleted: true,
      createdBy: 'user-1',
      completedBy: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T01:00:00.000Z',
    });

    const response = await PUT(
      createRequest({ title: '更新後', isCompleted: true }),
      createContext()
    );

    expect(response.status).toBe(200);
    expect(mockUpdateTodo).toHaveBeenCalledWith(
      'list-1',
      'todo-1',
      { title: '更新後', isCompleted: true },
      'user-1'
    );
    expect(mockGetPersonalListById).toHaveBeenCalledWith('user-1', 'list-1');
    await expect(response.json()).resolves.toEqual({
      data: {
        todoId: 'todo-1',
        listId: 'list-1',
        title: '更新後',
        isCompleted: true,
        createdBy: 'user-1',
        completedBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T01:00:00.000Z',
      },
    });
  });

  it('PUT: 更新対象がない場合は400を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    } as SessionOrUnauthorized);
    mockUpdateTodo.mockRejectedValue(new Error('更新内容が指定されていません'));

    const response = await PUT(createRequest({}), createContext());

    expect(response.status).toBe(400);
  });

  it('PUT: ToDo が見つからない場合は404を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    } as SessionOrUnauthorized);
    mockUpdateTodo.mockRejectedValue(new Error('ToDoが見つかりません'));

    const response = await PUT(createRequest({ isCompleted: true }), createContext());

    expect(response.status).toBe(404);
  });

  it('PUT: アクセス権限がない個人リストの場合は403を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    } as SessionOrUnauthorized);
    mockGetPersonalListById.mockResolvedValue(null);

    const response = await PUT(createRequest({ isCompleted: true }), createContext());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'FORBIDDEN',
        message: ERROR_MESSAGES.FORBIDDEN,
      },
    });
    expect(mockUpdateTodo).not.toHaveBeenCalled();
  });

  it('DELETE: ToDo を削除する', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    } as SessionOrUnauthorized);
    mockDeleteTodo.mockResolvedValue(undefined);

    const response = await DELETE({} as Request, createContext());

    expect(response.status).toBe(204);
    expect(mockGetPersonalListById).toHaveBeenCalledWith('user-1', 'list-1');
    expect(mockDeleteTodo).toHaveBeenCalledWith('list-1', 'todo-1');
  });

  it('DELETE: ToDo が見つからない場合は404を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    } as SessionOrUnauthorized);
    mockDeleteTodo.mockRejectedValue(new Error('ToDoが見つかりません'));

    const response = await DELETE({} as Request, createContext());

    expect(response.status).toBe(404);
  });

  it('DELETE: アクセス権限がない個人リストの場合は403を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    } as SessionOrUnauthorized);
    mockGetPersonalListById.mockResolvedValue(null);

    const response = await DELETE({} as Request, createContext());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'FORBIDDEN',
        message: ERROR_MESSAGES.FORBIDDEN,
      },
    });
    expect(mockDeleteTodo).not.toHaveBeenCalled();
  });
});
