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
  DynamoDBMembershipRepository: jest.fn(),
  DynamoDBTodoRepository: jest.fn(),
}));

import {
  DynamoDBListRepository,
  DynamoDBMembershipRepository,
  DynamoDBTodoRepository,
} from '@nagiyu/share-together-core';
import { GET, POST } from '@/app/api/groups/[groupId]/lists/[listId]/todos/route';
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
const mockDynamoDBMembershipRepository = DynamoDBMembershipRepository as jest.MockedClass<
  typeof DynamoDBMembershipRepository
>;
const mockDynamoDBTodoRepository = DynamoDBTodoRepository as jest.MockedClass<
  typeof DynamoDBTodoRepository
>;
type SessionOrErrorResponse = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

describe('/api/groups/[groupId]/lists/[listId]/todos route', () => {
  const mockGetMembershipById = jest.fn();
  const mockGetGroupListById = jest.fn();
  const mockGetByListId = jest.fn();
  const mockCreateTodo = jest.fn();
  let mockRandomUUID: jest.SpiedFunction<typeof crypto.randomUUID> | undefined;

  beforeEach(() => {
    process.env.DYNAMODB_TABLE_NAME = 'test-share-together-main';
    mockGetDynamoDBDocumentClient.mockReturnValue({ send: jest.fn() } as ReturnType<
      typeof getDynamoDBDocumentClient
    >);
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
      () =>
        ({
          getByListId: mockGetByListId,
          create: mockCreateTodo,
        }) as InstanceType<typeof DynamoDBTodoRepository>
    );
  });

  afterEach(() => {
    delete process.env.DYNAMODB_TABLE_NAME;
    mockRandomUUID?.mockRestore();
    mockRandomUUID = undefined;
    jest.clearAllMocks();
  });

  it('GET: 未認証の場合は401レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      status: 401,
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: '認証が必要です' } }),
    } as SessionOrErrorResponse);

    const response = await GET({} as Request, {
      params: Promise.resolve({ groupId: 'group-1', listId: 'list-1' }),
    });

    expect(response.status).toBe(401);
    expect(mockDynamoDBMembershipRepository).not.toHaveBeenCalled();
  });

  it('GET: 非メンバーの場合は403レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrErrorResponse);
    mockGetMembershipById.mockResolvedValue(null);

    const response = await GET({} as Request, {
      params: Promise.resolve({ groupId: 'group-1', listId: 'list-1' }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'アクセス権限がありません',
      },
    });
  });

  it('GET: 共有リストが存在しない場合は404レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrErrorResponse);
    mockGetMembershipById.mockResolvedValue({
      groupId: 'group-1',
      userId: 'user-1',
      status: 'ACCEPTED',
    });
    mockGetGroupListById.mockResolvedValue(null);

    const response = await GET({} as Request, {
      params: Promise.resolve({ groupId: 'group-1', listId: 'list-1' }),
    });

    expect(response.status).toBe(404);
    expect(mockGetByListId).not.toHaveBeenCalled();
  });

  it('GET: 共有リスト内のToDo一覧を返す', async () => {
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
    mockGetByListId.mockResolvedValue([
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

    const response = await GET({} as Request, {
      params: Promise.resolve({ groupId: 'group-1', listId: 'list-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockGetByListId).toHaveBeenCalledWith('list-1');
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

  it('POST: title が空文字の場合は400レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrErrorResponse);
    mockGetMembershipById.mockResolvedValue({
      groupId: 'group-1',
      userId: 'user-1',
      status: 'ACCEPTED',
    });

    const response = await POST({ json: async () => ({ title: '' }) } as Request, {
      params: Promise.resolve({ groupId: 'group-1', listId: 'list-1' }),
    });

    expect(response.status).toBe(400);
    expect(mockCreateTodo).not.toHaveBeenCalled();
  });

  it('POST: 共有リストにToDoを作成して201レスポンスを返す', async () => {
    mockRandomUUID = jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('todo-9');
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
    mockCreateTodo.mockResolvedValue({
      todoId: 'todo-9',
      listId: 'list-1',
      title: '卵を買う',
      isCompleted: false,
      createdBy: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const response = await POST({ json: async () => ({ title: '  卵を買う  ' }) } as Request, {
      params: Promise.resolve({ groupId: 'group-1', listId: 'list-1' }),
    });

    expect(response.status).toBe(201);
    expect(mockCreateTodo).toHaveBeenCalledWith({
      todoId: 'todo-9',
      listId: 'list-1',
      title: '卵を買う',
      isCompleted: false,
      createdBy: 'user-1',
    });
    await expect(response.json()).resolves.toEqual({
      data: {
        todoId: 'todo-9',
        listId: 'list-1',
        title: '卵を買う',
        isCompleted: false,
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
  });
});
