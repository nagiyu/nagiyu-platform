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

jest.mock('@nagiyu/aws', () => {
  const actualAws = jest.requireActual('@nagiyu/aws');
  return {
    ...actualAws,
    getDynamoDBDocumentClient: jest.fn(),
  };
});

jest.mock('@nagiyu/share-together-core', () => {
  const actualCore = jest.requireActual('@nagiyu/share-together-core');
  return {
    DynamoDBGroupRepository: jest.fn(),
    createGroupRepository: jest.fn(),
    DynamoDBMembershipRepository: jest.fn(),
    createMembershipRepository: jest.fn(),
    DynamoDBUserRepository: jest.fn(),
    createUserRepository: jest.fn(),
    inviteMember: jest.fn(),
    ERROR_MESSAGES: {
      DUPLICATE_INVITATION: actualCore.ERROR_MESSAGES.DUPLICATE_INVITATION,
      ALREADY_GROUP_MEMBER: actualCore.ERROR_MESSAGES.ALREADY_GROUP_MEMBER,
      MEMBER_LIMIT_EXCEEDED: actualCore.ERROR_MESSAGES.MEMBER_LIMIT_EXCEEDED,
    },
  };
});

import {
  DynamoDBGroupRepository,
  DynamoDBMembershipRepository,
  DynamoDBUserRepository,
  ERROR_MESSAGES as GROUP_CORE_ERROR_MESSAGES,
  inviteMember,
} from '@nagiyu/share-together-core';
import { GET, POST } from '@/app/api/groups/[groupId]/members/route';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';

const mockGetSessionOrUnauthorized = getSessionOrUnauthorized as jest.MockedFunction<
  typeof getSessionOrUnauthorized
>;
const mockGetDynamoDBDocumentClient = getDynamoDBDocumentClient as jest.MockedFunction<
  typeof getDynamoDBDocumentClient
>;
const mockDynamoDBGroupRepository = DynamoDBGroupRepository as jest.MockedClass<
  typeof DynamoDBGroupRepository
>;
(
  jest.requireMock('@nagiyu/share-together-core') as { createGroupRepository: jest.Mock }
).createGroupRepository.mockImplementation((...args: unknown[]) =>
  mockDynamoDBGroupRepository(...args)
);
const mockDynamoDBMembershipRepository = DynamoDBMembershipRepository as jest.MockedClass<
  typeof DynamoDBMembershipRepository
>;
(
  jest.requireMock('@nagiyu/share-together-core') as { createMembershipRepository: jest.Mock }
).createMembershipRepository.mockImplementation((...args: unknown[]) =>
  mockDynamoDBMembershipRepository(...args)
);
const mockDynamoDBUserRepository = DynamoDBUserRepository as jest.MockedClass<
  typeof DynamoDBUserRepository
>;
(
  jest.requireMock('@nagiyu/share-together-core') as { createUserRepository: jest.Mock }
).createUserRepository.mockImplementation((...args: unknown[]) =>
  mockDynamoDBUserRepository(...args)
);
const mockInviteMember = inviteMember as jest.MockedFunction<typeof inviteMember>;
type SessionOrUnauthorized = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

describe('/api/groups/[groupId]/members route', () => {
  const mockGetGroupById = jest.fn();
  const mockGetMembershipById = jest.fn();
  const mockGetMembershipsByGroupId = jest.fn();
  const mockGetUserById = jest.fn();
  const mockGetUserByEmail = jest.fn();

  beforeEach(() => {
    process.env.DYNAMODB_TABLE_NAME = 'test-share-together-main';

    mockGetDynamoDBDocumentClient.mockReturnValue({ send: jest.fn() } as ReturnType<
      typeof getDynamoDBDocumentClient
    >);
    mockDynamoDBGroupRepository.mockImplementation(
      () =>
        ({
          getById: mockGetGroupById,
        }) as InstanceType<typeof DynamoDBGroupRepository>
    );
    mockDynamoDBMembershipRepository.mockImplementation(
      () =>
        ({
          getById: mockGetMembershipById,
          getByGroupId: mockGetMembershipsByGroupId,
        }) as InstanceType<typeof DynamoDBMembershipRepository>
    );
    mockDynamoDBUserRepository.mockImplementation(
      () =>
        ({
          getById: mockGetUserById,
          getByEmail: mockGetUserByEmail,
        }) as InstanceType<typeof DynamoDBUserRepository>
    );
  });

  afterEach(() => {
    delete process.env.DYNAMODB_TABLE_NAME;
    jest.clearAllMocks();
  });

  it('GET: 未認証の場合は401レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      status: 401,
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: '認証が必要です' } }),
    } as SessionOrUnauthorized);

    const response = await GET({} as Request, { params: Promise.resolve({ groupId: 'group-1' }) });

    expect(response.status).toBe(401);
    expect(mockDynamoDBMembershipRepository).not.toHaveBeenCalled();
  });

  it('GET: 非メンバーは403レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
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

  it('GET: 承認済みメンバー一覧を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'owner-1' },
    } as SessionOrUnauthorized);
    mockGetMembershipById.mockResolvedValue({
      groupId: 'group-1',
      userId: 'owner-1',
      role: 'OWNER',
      status: 'ACCEPTED',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockGetMembershipsByGroupId.mockResolvedValue([
      {
        groupId: 'group-1',
        userId: 'owner-1',
        role: 'OWNER',
        status: 'ACCEPTED',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        groupId: 'group-1',
        userId: 'user-2',
        role: 'MEMBER',
        status: 'PENDING',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    mockGetUserById.mockResolvedValue({
      userId: 'owner-1',
      email: 'owner@example.com',
      name: 'オーナー',
      image: undefined,
      defaultListId: 'list-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const response = await GET({} as Request, { params: Promise.resolve({ groupId: 'group-1' }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        members: [
          {
            userId: 'owner-1',
            name: 'オーナー',
            email: 'owner@example.com',
            image: null,
            role: 'OWNER',
            joinedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    });
  });

  it('POST: オーナー以外は403レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'member-1' },
    } as SessionOrUnauthorized);
    mockGetGroupById.mockResolvedValue({
      groupId: 'group-1',
      ownerUserId: 'owner-1',
    });
    mockGetMembershipById.mockResolvedValue({
      groupId: 'group-1',
      userId: 'member-1',
      role: 'MEMBER',
      status: 'ACCEPTED',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const request = {
      json: jest.fn().mockResolvedValue({ email: 'invitee@example.com' }),
    } as unknown as Request;
    const response = await POST(request, { params: Promise.resolve({ groupId: 'group-1' }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'OWNER_ONLY',
        message: 'この操作はオーナーのみ実行できます',
      },
    });
  });

  it('POST: メールアドレス指定で招待を作成して201を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'owner-1' },
    } as SessionOrUnauthorized);
    mockGetGroupById.mockResolvedValue({
      groupId: 'group-1',
      ownerUserId: 'owner-1',
    });
    mockGetMembershipById.mockResolvedValue({
      groupId: 'group-1',
      userId: 'owner-1',
      role: 'OWNER',
      status: 'ACCEPTED',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockGetUserByEmail.mockResolvedValue({
      userId: 'user-2',
      email: 'invitee@example.com',
      name: '招待対象',
      defaultListId: 'list-2',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockInviteMember.mockResolvedValue({
      groupId: 'group-1',
      userId: 'user-2',
      role: 'MEMBER',
      status: 'PENDING',
      invitedBy: 'owner-1',
      invitedAt: '2026-01-02T00:00:00.000Z',
      ttl: 1767312000,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const request = {
      json: jest.fn().mockResolvedValue({ email: 'invitee@example.com' }),
    } as unknown as Request;
    const response = await POST(request, { params: Promise.resolve({ groupId: 'group-1' }) });

    expect(response.status).toBe(201);
    expect(mockInviteMember).toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      data: {
        groupId: 'group-1',
        inviteeUserId: 'user-2',
        inviteeName: '招待対象',
        status: 'PENDING',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    });
  });

  it('POST: 重複招待エラーは409を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'owner-1' },
    } as SessionOrUnauthorized);
    mockGetGroupById.mockResolvedValue({
      groupId: 'group-1',
      ownerUserId: 'owner-1',
    });
    mockGetMembershipById.mockResolvedValue({
      groupId: 'group-1',
      userId: 'owner-1',
      role: 'OWNER',
      status: 'ACCEPTED',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockGetUserByEmail.mockResolvedValue({
      userId: 'user-2',
      email: 'invitee@example.com',
      name: '招待対象',
      defaultListId: 'list-2',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockInviteMember.mockRejectedValue(new Error(GROUP_CORE_ERROR_MESSAGES.DUPLICATE_INVITATION));

    const request = {
      json: jest.fn().mockResolvedValue({ email: 'invitee@example.com' }),
    } as unknown as Request;
    const response = await POST(request, { params: Promise.resolve({ groupId: 'group-1' }) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'ALREADY_INVITED',
        message: '既に招待済みです',
      },
    });
  });

  it('POST: メンバー上限エラーは409を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'owner-1' },
    } as SessionOrUnauthorized);
    mockGetGroupById.mockResolvedValue({
      groupId: 'group-1',
      ownerUserId: 'owner-1',
    });
    mockGetMembershipById.mockResolvedValue({
      groupId: 'group-1',
      userId: 'owner-1',
      role: 'OWNER',
      status: 'ACCEPTED',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockGetUserByEmail.mockResolvedValue({
      userId: 'user-2',
      email: 'invitee@example.com',
      name: '招待対象',
      defaultListId: 'list-2',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockInviteMember.mockRejectedValue(new Error(GROUP_CORE_ERROR_MESSAGES.MEMBER_LIMIT_EXCEEDED));

    const request = {
      json: jest.fn().mockResolvedValue({ email: 'invitee@example.com' }),
    } as unknown as Request;
    const response = await POST(request, { params: Promise.resolve({ groupId: 'group-1' }) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'MEMBER_LIMIT_EXCEEDED',
        message: 'グループメンバーは最大5名です',
      },
    });
  });
});
