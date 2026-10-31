/**
 * @jest-environment node
 */

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
  ...jest.requireActual('@nagiyu/aws'),
  getDynamoDBDocumentClient: jest.fn(),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
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
import { GET, POST } from '@/app/api/lists/[listId]/todos/route';
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

import {
  createRequestWithJson,
  MALFORMED_BODY_CASES,
  type InvalidBodyCase,
} from '../../../invalidBodyCases';

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
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });
    mockGetTodosByListId.mockResolvedValue([
      {
        todoId: 'todo-1',
        listId: 'list-1',
        title: '牛乳を買う',
        isCompleted: false,
        createdBy: 'user-1',
        createdAt: 1767225600000,
        updatedAt: 1767225600000,
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
            createdAt: 1767225600000,
            updatedAt: 1767225600000,
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
      new EntityNotFoundError('PersonalList', 'USER#user-1#PLIST#list-unknown')
    );

    const response = await GET({} as Request, createContext('list-unknown'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'NOT_FOUND',
      message: '対象のデータが見つかりません',
    });
  });

  it('GET: InvalidInputError の場合は400を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    mockGetPersonalListById.mockResolvedValue({});
    mockGetTodosByListId.mockRejectedValue(new InvalidInputError('リストIDは必須です'));

    const response = await GET({} as Request, createContext('list-1'));

    expect(response.status).toBe(400);
  });

  it('GET: 不在や検証エラーと同じ文言でも素の Error は400/404にせず500を返す', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    mockGetPersonalListById.mockRejectedValue(new Error('個人リストが見つかりません'));
    const notFoundResponse = await GET({} as Request, createContext('list-1'));
    mockGetPersonalListById.mockResolvedValue({});
    mockGetTodosByListId.mockRejectedValue(new Error('リストIDは必須です'));
    const validationResponse = await GET({} as Request, createContext('list-1'));

    expect(notFoundResponse.status).toBe(500);
    expect(validationResponse.status).toBe(500);
  });

  it('POST: ToDo タイトルが不正で InvalidInputError の場合は400を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    mockGetPersonalListById.mockResolvedValue({});
    mockCreateTodo.mockRejectedValue(
      new InvalidInputError('ToDoのタイトルは1〜200文字で入力してください')
    );

    const response = await POST(createRequest({ title: '不正' }), createContext('list-1'));

    expect(response.status).toBe(400);
  });

  it('POST: 指定した個人リストが見つからない場合は404を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    mockGetPersonalListById.mockRejectedValue(
      new EntityNotFoundError('PersonalList', 'USER#user-1#PLIST#list-unknown')
    );

    const response = await POST(createRequest({ title: '牛乳' }), createContext('list-unknown'));

    expect(response.status).toBe(404);
    expect(mockCreateTodo).not.toHaveBeenCalled();
  });

  it('POST: 検証エラーと同じ文言でも素の Error は400にせず500を返す', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    mockGetPersonalListById.mockResolvedValue({});
    mockCreateTodo.mockRejectedValue(new Error('ToDoのタイトルは1〜200文字で入力してください'));

    const response = await POST(createRequest({ title: '不正' }), createContext('list-1'));

    expect(response.status).toBe(500);
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
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });
    mockCreateTodo.mockResolvedValue({
      todoId: 'todo-2',
      listId: 'list-1',
      title: '卵を買う',
      isCompleted: false,
      createdBy: 'user-1',
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
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
        createdAt: 1767225600000,
        updatedAt: 1767225600000,
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

  it.each<InvalidBodyCase>([
    ...MALFORMED_BODY_CASES,
    ['title が数値', async () => ({ title: 123 })],
  ])('POST: リクエストボディが不正な場合 (%s) は400を返す', async (_label, json) => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);

    const response = await POST(createRequestWithJson(json), createContext('list-1'));

    expect(response.status).toBe(400);
    expect(mockCreateTodo).not.toHaveBeenCalled();
  });
});
