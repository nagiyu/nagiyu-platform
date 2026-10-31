/**
 * @jest-environment node
 */

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

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  getDynamoDBDocumentClient: jest.fn(),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('@nagiyu/share-together-core', () => ({
  DynamoDBListRepository: jest.fn(),
  createListRepository: jest.fn(),
  DynamoDBMembershipRepository: jest.fn(),
  createMembershipRepository: jest.fn(),
  DynamoDBTodoRepository: jest.fn(),
  createTodoRepository: jest.fn(),
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
import { EntityNotFoundError, getDynamoDBDocumentClient } from '@nagiyu/aws';
import { InvalidInputError } from '@nagiyu/common';

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
const mockDynamoDBMembershipRepository = DynamoDBMembershipRepository as jest.MockedClass<
  typeof DynamoDBMembershipRepository
>;
(
  jest.requireMock('@nagiyu/share-together-core') as { createMembershipRepository: jest.Mock }
).createMembershipRepository.mockImplementation((...args: unknown[]) =>
  mockDynamoDBMembershipRepository(...args)
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
type SessionOrErrorResponse = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

import {
  createRequestWithJson,
  MALFORMED_BODY_CASES,
  type InvalidBodyCase,
} from '../../../../../../invalidBodyCases';

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
      error: 'FORBIDDEN',
      message: 'この操作を実行する権限がありません',
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
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });
    mockUpdateTodo.mockResolvedValue({
      todoId: 'todo-1',
      listId: 'list-1',
      title: '更新後',
      isCompleted: true,
      createdBy: 'user-1',
      completedBy: 'user-1',
      createdAt: 1767225600000,
      updatedAt: 1767229200000,
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
        createdAt: 1767225600000,
        updatedAt: 1767229200000,
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
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
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
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });
    mockDeleteTodo.mockRejectedValue(new EntityNotFoundError('TodoItem', 'TODO#list-1#todo-1'));

    const response = await DELETE({} as Request, createContext());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'NOT_FOUND',
      message: '対象のデータが見つかりません',
    });
  });

  describe('エラーの振り分け', () => {
    beforeEach(() => {
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
        createdAt: 1767225600000,
        updatedAt: 1767225600000,
      });
    });

    it('PUT: InvalidInputError の場合は400を返す', async () => {
      mockUpdateTodo.mockRejectedValue(
        new InvalidInputError('ToDoのタイトルは1〜200文字で入力してください')
      );

      const response = await PUT(
        { json: async () => ({ title: '更新後' }) } as Request,
        createContext()
      );

      expect(response.status).toBe(400);
    });

    it('PUT: EntityNotFoundError の場合は404を返す', async () => {
      mockUpdateTodo.mockRejectedValue(new EntityNotFoundError('TodoItem', 'TODO#list-1#todo-1'));

      const response = await PUT(
        { json: async () => ({ title: '更新後' }) } as Request,
        createContext()
      );

      expect(response.status).toBe(404);
    });

    it('PUT: 不在や検証エラーと同じ文言でも素の Error は400/404にせず500を返す', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockUpdateTodo.mockRejectedValue(new Error('ToDoが見つかりません'));
      const notFoundResponse = await PUT(
        { json: async () => ({ title: '更新後' }) } as Request,
        createContext()
      );
      mockUpdateTodo.mockRejectedValue(new Error('更新するフィールドが指定されていません'));
      const validationResponse = await PUT(
        { json: async () => ({ title: '更新後' }) } as Request,
        createContext()
      );

      expect(notFoundResponse.status).toBe(500);
      expect(validationResponse.status).toBe(500);
    });

    it('DELETE: InvalidInputError の場合は400を返す', async () => {
      mockDeleteTodo.mockRejectedValue(new InvalidInputError('ToDo IDは必須です'));

      const response = await DELETE({} as Request, createContext());

      expect(response.status).toBe(400);
    });

    it('DELETE: 不在と同じ文言でも素の Error は404にせず500を返す', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockDeleteTodo.mockRejectedValue(new Error('ToDoが見つかりません'));

      const response = await DELETE({} as Request, createContext());

      expect(response.status).toBe(500);
    });
  });

  it.each<InvalidBodyCase>([
    ...MALFORMED_BODY_CASES,
    ['title が数値', async () => ({ title: 123 })],
    ['isCompleted が文字列', async () => ({ isCompleted: 'true' })],
  ])('PUT: リクエストボディが不正な場合 (%s) は400を返す', async (_label, json) => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrErrorResponse);
    mockGetMembershipById.mockResolvedValue({
      groupId: 'group-1',
      userId: 'user-1',
      status: 'ACCEPTED',
    });

    const response = await PUT(createRequestWithJson(json), createContext());

    expect(response.status).toBe(400);
    expect(mockUpdateTodo).not.toHaveBeenCalled();
  });
});
