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
  getDynamoDBDocumentClient: jest.fn(),
}));

jest.mock('@nagiyu/share-together-core', () => ({
  DynamoDBListRepository: jest.fn(),
  createListRepository: jest.fn(),
  DynamoDBMembershipRepository: jest.fn(),
  createMembershipRepository: jest.fn(),
  DynamoDBTodoRepository: jest.fn(),
  createTodoRepository: jest.fn(),
}));

import {
  DynamoDBListRepository,
  DynamoDBMembershipRepository,
  DynamoDBTodoRepository,
} from '@nagiyu/share-together-core';
import { DELETE, PUT } from '@/app/api/groups/[groupId]/lists/[listId]/route';
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
type SessionOrErrorResponse = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

describe('/api/groups/[groupId]/lists/[listId] route', () => {
  const mockGetMembershipById = jest.fn();
  const mockGetGroupListById = jest.fn();
  const mockUpdateGroupList = jest.fn();
  const mockDeleteGroupList = jest.fn();
  const mockDeleteByListId = jest.fn();

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
          updateGroupList: mockUpdateGroupList,
          deleteGroupList: mockDeleteGroupList,
        }) as InstanceType<typeof DynamoDBListRepository>
    );
    mockDynamoDBTodoRepository.mockImplementation(
      () =>
        ({
          deleteByListId: mockDeleteByListId,
        }) as InstanceType<typeof DynamoDBTodoRepository>
    );
  });

  afterEach(() => {
    delete process.env.DYNAMODB_TABLE_NAME;
    jest.clearAllMocks();
  });

  it('PUT: 未認証の場合は401レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      status: 401,
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: '認証が必要です' } }),
    } as SessionOrErrorResponse);

    const response = await PUT({ json: async () => ({ name: '更新名' }) } as Request, {
      params: Promise.resolve({ groupId: 'group-1', listId: 'list-1' }),
    });

    expect(response.status).toBe(401);
    expect(mockDynamoDBMembershipRepository).not.toHaveBeenCalled();
  });

  it('PUT: 非メンバーの場合は403レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrErrorResponse);
    mockGetMembershipById.mockResolvedValue(null);

    const response = await PUT({ json: async () => ({ name: '更新名' }) } as Request, {
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

  it('PUT: name が不正な場合は400レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrErrorResponse);
    mockGetMembershipById.mockResolvedValue({
      groupId: 'group-1',
      userId: 'user-1',
      status: 'ACCEPTED',
    });

    const response = await PUT({ json: async () => ({ name: '' }) } as Request, {
      params: Promise.resolve({ groupId: 'group-1', listId: 'list-1' }),
    });

    expect(response.status).toBe(400);
    expect(mockUpdateGroupList).not.toHaveBeenCalled();
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

    const response = await PUT({ json: async () => ({ name: '更新名' }) } as Request, {
      params: Promise.resolve({ groupId: 'group-1', listId: 'list-1' }),
    });

    expect(response.status).toBe(404);
    expect(mockUpdateGroupList).not.toHaveBeenCalled();
  });

  it('PUT: 共有リスト名を更新して200レスポンスを返す', async () => {
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
      name: '更新前',
      createdBy: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockUpdateGroupList.mockResolvedValue({
      listId: 'list-1',
      groupId: 'group-1',
      name: '更新後',
      createdBy: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const response = await PUT({ json: async () => ({ name: '  更新後  ' }) } as Request, {
      params: Promise.resolve({ groupId: 'group-1', listId: 'list-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockUpdateGroupList).toHaveBeenCalledWith('group-1', 'list-1', { name: '更新後' });
    await expect(response.json()).resolves.toEqual({
      data: {
        listId: 'list-1',
        groupId: 'group-1',
        name: '更新後',
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    });
  });

  it('DELETE: 共有リストをカスケード削除して204レスポンスを返す', async () => {
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

    const response = await DELETE({} as Request, {
      params: Promise.resolve({ groupId: 'group-1', listId: 'list-1' }),
    });

    expect(response.status).toBe(204);
    expect(mockNextResponseJson).not.toHaveBeenCalled();
    expect(mockDeleteByListId).toHaveBeenCalledWith('list-1');
    expect(mockDeleteGroupList).toHaveBeenCalledWith('group-1', 'list-1');
  });

  it('DELETE: 共有リストが存在しない場合は404レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrErrorResponse);
    mockGetMembershipById.mockResolvedValue({
      groupId: 'group-1',
      userId: 'user-1',
      status: 'ACCEPTED',
    });
    mockGetGroupListById.mockResolvedValue(null);

    const response = await DELETE({} as Request, {
      params: Promise.resolve({ groupId: 'group-1', listId: 'list-1' }),
    });

    expect(response.status).toBe(404);
    expect(mockDeleteByListId).not.toHaveBeenCalled();
    expect(mockDeleteGroupList).not.toHaveBeenCalled();
  });
});
