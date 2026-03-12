const mockNextResponseJson = jest.fn((body: unknown, init?: { status?: number }) => ({
  status: init?.status ?? 200,
  json: async () => body,
}));

jest.mock('next/server', () => ({
  NextResponse: class MockNextResponse {
    public status: number;
    private body: unknown;

    constructor(body: unknown, init?: { status?: number }) {
      this.status = init?.status ?? 200;
      this.body = body;
    }

    public json = async (): Promise<unknown> => this.body;

    public static json = mockNextResponseJson;
  },
}));

jest.mock('@/lib/auth/session', () => ({
  getSessionOrUnauthorized: jest.fn(),
}));

jest.mock('@/lib/aws-clients', () => ({
  getDocClient: jest.fn(),
}));

jest.mock('@nagiyu/share-together-core', () => ({
  DynamoDBListRepository: jest.fn(),
  DynamoDBMembershipRepository: jest.fn(),
  DynamoDBTodoRepository: jest.fn(),
  TodoService: jest.fn(),
}));

import {
  DynamoDBListRepository,
  DynamoDBMembershipRepository,
  DynamoDBTodoRepository,
  TodoService,
} from '@nagiyu/share-together-core';
import { DELETE, PUT } from '@/app/api/groups/[groupId]/lists/[listId]/todos/[todoId]/route';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDocClient } from '@/lib/aws-clients';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

const mockGetSessionOrUnauthorized = getSessionOrUnauthorized as jest.MockedFunction<
  typeof getSessionOrUnauthorized
>;
const mockGetDocClient = getDocClient as jest.MockedFunction<typeof getDocClient>;
const mockDynamoDBListRepository = DynamoDBListRepository as jest.MockedClass<
  typeof DynamoDBListRepository
>;
const mockDynamoDBMembershipRepository = DynamoDBMembershipRepository as jest.MockedClass<
  typeof DynamoDBMembershipRepository
>;
const mockDynamoDBTodoRepository = DynamoDBTodoRepository as jest.MockedClass<
  typeof DynamoDBTodoRepository
>;
const mockTodoService = TodoService as jest.MockedClass<typeof TodoService>;
type SessionOrErrorResponse = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

describe('/api/groups/[groupId]/lists/[listId]/todos/[todoId] route', () => {
  const mockGetMembershipById = jest.fn();
  const mockGetGroupListById = jest.fn();
  const mockUpdateTodo = jest.fn();
  const mockDeleteTodo = jest.fn();

  const createContext = (
    groupId = 'group-1',
    listId = 'list-1',
    todoId = 'todo-1'
  ): { params: Promise<{ groupId: string; listId: string; todoId: string }> } => ({
    params: Promise.resolve({ groupId, listId, todoId }),
  });

  beforeEach(() => {
    process.env.DYNAMODB_TABLE_NAME = 'test-share-together-main';
    mockGetDocClient.mockReturnValue({ send: jest.fn() } as ReturnType<typeof getDocClient>);
    mockDynamoDBMembershipRepository.mockImplementation(
      () =>
        ({
          getById: mockGetMembershipById,
        }) as InstanceType<typeof DynamoDBMembershipRepository>
    );
    mockDynamoDBListRepository.mockImplementation(
      () =>
        ({
          getGroupListById: mockGetGroupListById,
        }) as InstanceType<typeof DynamoDBListRepository>
    );
    mockDynamoDBTodoRepository.mockImplementation(
      () => ({}) as InstanceType<typeof DynamoDBTodoRepository>
    );
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

  it('PUT: 非メンバーの場合は403レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrErrorResponse);
    mockGetMembershipById.mockResolvedValue(null);

    const response = await PUT(
      { json: async () => ({ title: '更新後' }) } as Request,
      createContext()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'アクセス権限がありません',
      },
    });
  });

  it('PUT: 共有リストが存在しない場合は404レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrErrorResponse);
    mockGetMembershipById.mockResolvedValue({
      groupId: 'group-1',
      userId: 'user-1',
      status: 'ACCEPTED',
    });
    mockGetGroupListById.mockResolvedValue(null);

    const response = await PUT(
      { json: async () => ({ title: '更新後' }) } as Request,
      createContext()
    );

    expect(response.status).toBe(404);
    expect(mockUpdateTodo).not.toHaveBeenCalled();
  });

  it('PUT: 共有ToDoを更新して200レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrErrorResponse);
    mockGetMembershipById.mockResolvedValue({
      groupId: 'group-1',
      userId: 'user-1',
      status: 'ACCEPTED',
    });
    mockGetGroupListById.mockResolvedValue({
      listId: 'list-1',
      groupId: 'group-1',
      name: '共有リスト',
      createdBy: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
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
      { json: async () => ({ title: '更新後', isCompleted: true }) } as Request,
      createContext()
    );

    expect(response.status).toBe(200);
    expect(mockUpdateTodo).toHaveBeenCalledWith(
      'list-1',
      'todo-1',
      { title: '更新後', isCompleted: true },
      'user-1'
    );
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

  it('DELETE: 共有ToDoを削除して204レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrErrorResponse);
    mockGetMembershipById.mockResolvedValue({
      groupId: 'group-1',
      userId: 'user-1',
      status: 'ACCEPTED',
    });
    mockGetGroupListById.mockResolvedValue({
      listId: 'list-1',
      groupId: 'group-1',
      name: '共有リスト',
      createdBy: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const response = await DELETE({} as Request, createContext());

    expect(response.status).toBe(204);
    expect(mockNextResponseJson).not.toHaveBeenCalled();
    expect(mockDeleteTodo).toHaveBeenCalledWith('list-1', 'todo-1');
  });

  it('DELETE: ToDoが存在しない場合は404レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrErrorResponse);
    mockGetMembershipById.mockResolvedValue({
      groupId: 'group-1',
      userId: 'user-1',
      status: 'ACCEPTED',
    });
    mockGetGroupListById.mockResolvedValue({
      listId: 'list-1',
      groupId: 'group-1',
      name: '共有リスト',
      createdBy: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockDeleteTodo.mockRejectedValue(new Error(ERROR_MESSAGES.TODO_NOT_FOUND));

    const response = await DELETE({} as Request, createContext());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'NOT_FOUND',
        message: '対象のデータが見つかりません',
      },
    });
  });
});
