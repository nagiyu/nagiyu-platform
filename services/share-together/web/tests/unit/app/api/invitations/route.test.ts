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
  DynamoDBMembershipRepository: jest.fn(),
  DynamoDBGroupRepository: jest.fn(),
}));

import { BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBGroupRepository, DynamoDBMembershipRepository } from '@nagiyu/share-together-core';
import { GET } from '@/app/api/invitations/route';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';

const mockGetSessionOrUnauthorized = getSessionOrUnauthorized as jest.MockedFunction<
  typeof getSessionOrUnauthorized
>;
const mockGetDynamoDBDocumentClient = getDynamoDBDocumentClient as jest.MockedFunction<typeof getDynamoDBDocumentClient>;
const mockDynamoDBMembershipRepository = DynamoDBMembershipRepository as jest.MockedClass<
  typeof DynamoDBMembershipRepository
>;
const mockDynamoDBGroupRepository = DynamoDBGroupRepository as jest.MockedClass<
  typeof DynamoDBGroupRepository
>;
type SessionOrUnauthorized = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

describe('GET /api/invitations', () => {
  const mockSend = jest.fn();
  const mockGetPendingInvitationsByUserId = jest.fn();
  const mockBatchGetByIds = jest.fn();

  beforeEach(() => {
    process.env.DYNAMODB_TABLE_NAME = 'test-share-together-main';
    mockGetDynamoDBDocumentClient.mockReturnValue({ send: mockSend } as ReturnType<typeof getDynamoDBDocumentClient>);
    mockDynamoDBMembershipRepository.mockImplementation(
      () =>
        ({
          getPendingInvitationsByUserId: mockGetPendingInvitationsByUserId,
        }) as InstanceType<typeof DynamoDBMembershipRepository>
    );
    mockDynamoDBGroupRepository.mockImplementation(
      () =>
        ({
          batchGetByIds: mockBatchGetByIds,
        }) as InstanceType<typeof DynamoDBGroupRepository>
    );
  });

  afterEach(() => {
    delete process.env.DYNAMODB_TABLE_NAME;
    jest.clearAllMocks();
  });

  it('未認証の場合は401レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      status: 401,
      json: async () => ({
        error: { code: 'UNAUTHORIZED', message: '認証が必要です' },
      }),
    } as SessionOrUnauthorized);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockDynamoDBMembershipRepository).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('保留中招待一覧をグループ名・招待者名付きで返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    mockGetPendingInvitationsByUserId.mockResolvedValue([
      {
        groupId: 'group-1',
        userId: 'user-1',
        role: 'MEMBER',
        status: 'PENDING',
        invitedBy: 'inviter-1',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    ]);
    mockBatchGetByIds.mockResolvedValue([
      {
        groupId: 'group-1',
        name: '買い物グループ',
        ownerUserId: 'owner-1',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    ]);
    mockSend.mockResolvedValue({
      Responses: {
        'test-share-together-main': [
          {
            userId: 'inviter-1',
            name: '招待者ユーザー',
          },
        ],
      },
    });

    const response = await GET();
    const command = mockSend.mock.calls[0]?.[0] as BatchGetCommand;

    expect(response.status).toBe(200);
    expect(command).toBeInstanceOf(BatchGetCommand);
    await expect(response.json()).resolves.toEqual({
      data: {
        invitations: [
          {
            groupId: 'group-1',
            groupName: '買い物グループ',
            inviterUserId: 'inviter-1',
            inviterName: '招待者ユーザー',
            createdAt: '2026-03-01T00:00:00.000Z',
          },
        ],
      },
    });
  });

  it('例外発生時は500レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    delete process.env.DYNAMODB_TABLE_NAME;

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'サーバーエラーが発生しました',
      },
    });
  });
});
