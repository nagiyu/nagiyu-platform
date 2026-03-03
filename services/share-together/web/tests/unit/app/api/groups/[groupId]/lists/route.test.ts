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
  DynamoDBListRepository: jest.fn(),
  DynamoDBMembershipRepository: jest.fn(),
}));

import { DynamoDBListRepository, DynamoDBMembershipRepository } from '@nagiyu/share-together-core';
import { GET, POST } from '@/app/api/groups/[groupId]/lists/route';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getAwsClients } from '@/lib/aws-clients';

const mockGetSessionOrUnauthorized = getSessionOrUnauthorized as jest.MockedFunction<
  typeof getSessionOrUnauthorized
>;
const mockGetAwsClients = getAwsClients as jest.MockedFunction<typeof getAwsClients>;
const mockDynamoDBListRepository = DynamoDBListRepository as jest.MockedClass<
  typeof DynamoDBListRepository
>;
const mockDynamoDBMembershipRepository = DynamoDBMembershipRepository as jest.MockedClass<
  typeof DynamoDBMembershipRepository
>;
type SessionOrErrorResponse = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

describe('/api/groups/[groupId]/lists route', () => {
  const mockGetMembershipById = jest.fn();
  const mockGetGroupListsByGroupId = jest.fn();
  const mockCreateGroupList = jest.fn();
  let mockRandomUUID: jest.SpiedFunction<typeof crypto.randomUUID> | undefined;

  beforeEach(() => {
    process.env.DYNAMODB_TABLE_NAME = 'test-share-together-main';
    mockGetAwsClients.mockReturnValue({
      docClient: { send: jest.fn() } as ReturnType<typeof getAwsClients>['docClient'],
    });
    mockDynamoDBMembershipRepository.mockImplementation(
      () =>
        ({
          getById: mockGetMembershipById,
        }) as InstanceType<typeof DynamoDBMembershipRepository>
    );
    mockDynamoDBListRepository.mockImplementation(
      () =>
        ({
          getGroupListsByGroupId: mockGetGroupListsByGroupId,
          createGroupList: mockCreateGroupList,
        }) as InstanceType<typeof DynamoDBListRepository>
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

    const response = await GET({} as Request, { params: Promise.resolve({ groupId: 'group-1' }) });

    expect(response.status).toBe(401);
    expect(mockDynamoDBMembershipRepository).not.toHaveBeenCalled();
  });

  it('GET: 非メンバーの場合は403レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrErrorResponse);
    mockGetMembershipById.mockResolvedValue(null);

    const response = await GET({} as Request, { params: Promise.resolve({ groupId: 'group-1' }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'アクセス権限がありません',
      },
    });
  });

  it('GET: 共有リスト一覧を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrErrorResponse);
    mockGetMembershipById.mockResolvedValue({
      groupId: 'group-1',
      userId: 'user-1',
      status: 'ACCEPTED',
    });
    mockGetGroupListsByGroupId.mockResolvedValue([
      {
        listId: 'list-1',
        groupId: 'group-1',
        name: '共有リスト',
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const response = await GET({} as Request, { params: Promise.resolve({ groupId: 'group-1' }) });

    expect(response.status).toBe(200);
    expect(mockGetGroupListsByGroupId).toHaveBeenCalledWith('group-1');
    await expect(response.json()).resolves.toEqual({
      data: {
        lists: [
          {
            listId: 'list-1',
            groupId: 'group-1',
            name: '共有リスト',
            createdBy: 'user-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    });
  });

  it('POST: name が空文字の場合は400レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrErrorResponse);
    mockGetMembershipById.mockResolvedValue({
      groupId: 'group-1',
      userId: 'user-1',
      status: 'ACCEPTED',
    });

    const response = await POST({ json: async () => ({ name: '' }) } as Request, {
      params: Promise.resolve({ groupId: 'group-1' }),
    });

    expect(response.status).toBe(400);
    expect(mockCreateGroupList).not.toHaveBeenCalled();
  });

  it('POST: name が101文字以上の場合は400レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrErrorResponse);
    mockGetMembershipById.mockResolvedValue({
      groupId: 'group-1',
      userId: 'user-1',
      status: 'ACCEPTED',
    });

    const response = await POST({ json: async () => ({ name: 'a'.repeat(101) }) } as Request, {
      params: Promise.resolve({ groupId: 'group-1' }),
    });

    expect(response.status).toBe(400);
    expect(mockCreateGroupList).not.toHaveBeenCalled();
  });

  it('POST: 共有リストを作成して201レスポンスを返す', async () => {
    mockRandomUUID = jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('list-9');
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrErrorResponse);
    mockGetMembershipById.mockResolvedValue({
      groupId: 'group-1',
      userId: 'user-1',
      status: 'ACCEPTED',
    });
    mockCreateGroupList.mockResolvedValue({
      listId: 'list-9',
      groupId: 'group-1',
      name: '新しい共有リスト',
      createdBy: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const response = await POST(
      { json: async () => ({ name: '  新しい共有リスト  ' }) } as Request,
      { params: Promise.resolve({ groupId: 'group-1' }) }
    );

    expect(response.status).toBe(201);
    expect(mockCreateGroupList).toHaveBeenCalledWith({
      listId: 'list-9',
      groupId: 'group-1',
      name: '新しい共有リスト',
      createdBy: 'user-1',
    });
    await expect(response.json()).resolves.toEqual({
      data: {
        listId: 'list-9',
        groupId: 'group-1',
        name: '新しい共有リスト',
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
  });
});
