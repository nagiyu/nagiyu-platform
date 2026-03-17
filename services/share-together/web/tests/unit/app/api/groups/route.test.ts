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
  createGroup: jest.fn(),
  DynamoDBGroupRepository: jest.fn(),
  createGroupRepository: jest.fn(),
  DynamoDBMembershipRepository: jest.fn(),
  createMembershipRepository: jest.fn(),
}));

import {
  createGroup,
  DynamoDBGroupRepository,
  DynamoDBMembershipRepository,
} from '@nagiyu/share-together-core';
import { GET, POST } from '@/app/api/groups/route';
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
const mockCreateGroup = createGroup as jest.MockedFunction<typeof createGroup>;
type SessionOrUnauthorized = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

describe('/api/groups route', () => {
  const mockSend = jest.fn();
  const mockBatchGetByIds = jest.fn();
  const mockGetByUserId = jest.fn();
  let randomUuidSpy: jest.SpiedFunction<typeof crypto.randomUUID> | null = null;

  beforeEach(() => {
    process.env.DYNAMODB_TABLE_NAME = 'test-share-together-main';
    mockGetDynamoDBDocumentClient.mockReturnValue({ send: mockSend } as ReturnType<
      typeof getDynamoDBDocumentClient
    >);
    mockDynamoDBGroupRepository.mockImplementation(
      () =>
        ({
          batchGetByIds: mockBatchGetByIds,
        }) as InstanceType<typeof DynamoDBGroupRepository>
    );
    mockDynamoDBMembershipRepository.mockImplementation(
      () =>
        ({
          getByUserId: mockGetByUserId,
        }) as InstanceType<typeof DynamoDBMembershipRepository>
    );
  });

  afterEach(() => {
    delete process.env.DYNAMODB_TABLE_NAME;
    randomUuidSpy?.mockRestore();
    randomUuidSpy = null;
    jest.clearAllMocks();
  });

  it('GET: 未認証の場合は401レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      status: 401,
      json: async () => ({
        error: { code: 'UNAUTHORIZED', message: '認証が必要です' },
      }),
    } as SessionOrUnauthorized);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockDynamoDBGroupRepository).not.toHaveBeenCalled();
    expect(mockDynamoDBMembershipRepository).not.toHaveBeenCalled();
  });

  it('GET: 承認済みグループ一覧を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    mockGetByUserId.mockResolvedValue([
      { groupId: 'group-1', userId: 'user-1', role: 'OWNER', status: 'ACCEPTED' },
      { groupId: 'group-2', userId: 'user-1', role: 'MEMBER', status: 'ACCEPTED' },
      { groupId: 'group-3', userId: 'user-1', role: 'MEMBER', status: 'PENDING' },
    ]);
    mockBatchGetByIds.mockResolvedValue([
      {
        groupId: 'group-1',
        name: 'オーナーグループ',
        ownerUserId: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        groupId: 'group-2',
        name: '参加中グループ',
        ownerUserId: 'user-2',
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockBatchGetByIds).toHaveBeenCalledWith(['group-1', 'group-2']);
    await expect(response.json()).resolves.toEqual({
      data: {
        currentUserId: 'user-1',
        groups: [
          expect.objectContaining({ groupId: 'group-1', isOwner: true }),
          expect.objectContaining({ groupId: 'group-2', isOwner: false }),
        ],
      },
    });
  });

  it('POST: グループを作成して201レスポンスを返す', async () => {
    randomUuidSpy = jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('group-99');
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'owner-1' },
    } as SessionOrUnauthorized);
    mockCreateGroup.mockResolvedValue({
      group: {
        groupId: 'group-99',
        name: '新規グループ',
        ownerUserId: 'owner-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      ownerMembership: {
        groupId: 'group-99',
        userId: 'owner-1',
        role: 'OWNER',
        status: 'ACCEPTED',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    const response = await POST({
      json: async () => ({ name: '新規グループ' }),
    } as Request);

    expect(response.status).toBe(201);
    expect(mockCreateGroup).toHaveBeenCalledWith(
      {
        groupId: 'group-99',
        name: '新規グループ',
        ownerUserId: 'owner-1',
      },
      expect.objectContaining({
        groupRepository: expect.any(Object),
        membershipRepository: expect.any(Object),
      })
    );
    await expect(response.json()).resolves.toEqual({
      data: expect.objectContaining({ groupId: 'group-99' }),
    });
  });

  it('POST: name が不正な場合は400レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'owner-1' },
    } as SessionOrUnauthorized);

    const response = await POST({
      json: async () => ({ name: '' }),
    } as Request);

    expect(response.status).toBe(400);
    expect(mockCreateGroup).not.toHaveBeenCalled();
  });
});
