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
  getAwsClients: jest.fn(),
}));

jest.mock('@nagiyu/share-together-core', () => ({
  DynamoDBTodoRepository: jest.fn(),
  TodoService: jest.fn(),
}));

import { DELETE, PUT } from '@/app/api/lists/[listId]/todos/[todoId]/route';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getAwsClients } from '@/lib/aws-clients';
import { DynamoDBTodoRepository, TodoService } from '@nagiyu/share-together-core';

const mockGetSessionOrUnauthorized = getSessionOrUnauthorized as jest.MockedFunction<
  typeof getSessionOrUnauthorized
>;
const mockGetAwsClients = getAwsClients as jest.MockedFunction<typeof getAwsClients>;
const mockDynamoDBTodoRepository = DynamoDBTodoRepository as jest.MockedClass<
  typeof DynamoDBTodoRepository
>;
const mockTodoService = TodoService as jest.MockedClass<typeof TodoService>;
type SessionOrUnauthorized = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

describe('/api/lists/[listId]/todos/[todoId] route handlers', () => {
  const mockUpdateTodo = jest.fn();
  const mockDeleteTodo = jest.fn();
  const createRequest = (body: unknown): Request =>
    ({
      json: async () => body,
    }) as Request;
  const createContext = (listId = 'list-1', todoId = 'todo-1'): { params: Promise<{ listId: string; todoId: string }> } => ({
    params: Promise.resolve({ listId, todoId }),
  });

  beforeEach(() => {
    process.env.DYNAMODB_TABLE_NAME = 'test-share-together-main';

    mockGetAwsClients.mockReturnValue({
      docClient: { send: jest.fn() } as ReturnType<typeof getAwsClients>['docClient'],
    });

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

    const response = await PUT(createRequest({ title: '更新後', isCompleted: true }), createContext());

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

  it('DELETE: ToDo を削除する', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    } as SessionOrUnauthorized);
    mockDeleteTodo.mockResolvedValue(undefined);

    const response = await DELETE({} as Request, createContext());

    expect(response.status).toBe(204);
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
});
