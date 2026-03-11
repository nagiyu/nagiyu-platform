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
  DynamoDBGroupRepository: jest.fn(),
  DynamoDBMembershipRepository: jest.fn(),
  leaveGroup: jest.fn(),
  removeMember: jest.fn(),
  ERROR_MESSAGES: {
    MEMBERSHIP_NOT_FOUND: 'メンバーシップが見つかりません',
    OWNER_CANNOT_LEAVE: 'オーナーはグループから脱退できません',
  },
}));

import {
  DynamoDBMembershipRepository,
  leaveGroup,
  removeMember,
} from '@nagiyu/share-together-core';
import { DELETE } from '@/app/api/groups/[groupId]/members/[userId]/route';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDocClient } from '@/lib/aws-clients';

const mockGetSessionOrUnauthorized = getSessionOrUnauthorized as jest.MockedFunction<
  typeof getSessionOrUnauthorized
>;
const mockGetDocClient = getDocClient as jest.MockedFunction<typeof getDocClient>;
const mockDynamoDBMembershipRepository = DynamoDBMembershipRepository as jest.MockedClass<
  typeof DynamoDBMembershipRepository
>;
const mockLeaveGroup = leaveGroup as jest.MockedFunction<typeof leaveGroup>;
const mockRemoveMember = removeMember as jest.MockedFunction<typeof removeMember>;
type SessionOrUnauthorized = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

describe('DELETE /api/groups/[groupId]/members/[userId]', () => {
  const mockGetById = jest.fn();

  beforeEach(() => {
    process.env.DYNAMODB_TABLE_NAME = 'test-share-together-main';
    mockGetDocClient.mockReturnValue({ send: jest.fn() } as ReturnType<typeof getDocClient>);
    mockDynamoDBMembershipRepository.mockImplementation(
      () =>
        ({
          getById: mockGetById,
        }) as InstanceType<typeof DynamoDBMembershipRepository>
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

    const response = await DELETE({} as Request, {
      params: Promise.resolve({ groupId: 'group-1', userId: 'member-1' }),
    });

    expect(response.status).toBe(401);
    expect(mockLeaveGroup).not.toHaveBeenCalled();
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it('本人の脱退では leaveGroup を呼び出して204を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'member-1' },
    } as SessionOrUnauthorized);
    mockLeaveGroup.mockResolvedValue(undefined);

    const response = await DELETE({} as Request, {
      params: Promise.resolve({ groupId: 'group-1', userId: 'member-1' }),
    });

    expect(response.status).toBe(204);
    expect(mockNextResponseJson).not.toHaveBeenCalled();
    expect(mockLeaveGroup).toHaveBeenCalledWith(
      { groupId: 'group-1', userId: 'member-1' },
      expect.objectContaining({
        membershipRepository: expect.any(Object),
        groupRepository: expect.any(Object),
      })
    );
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it('他ユーザー除外時にオーナーでなければ403を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'member-1' },
    } as SessionOrUnauthorized);
    mockGetById.mockResolvedValue({ role: 'MEMBER' });

    const response = await DELETE({} as Request, {
      params: Promise.resolve({ groupId: 'group-1', userId: 'member-2' }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'OWNER_ONLY', message: 'この操作はオーナーのみ実行できます' },
    });
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it('オーナーによるメンバー除外は removeMember を呼び出して204を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'owner-1' },
    } as SessionOrUnauthorized);
    mockGetById.mockResolvedValue({ role: 'OWNER' });
    mockRemoveMember.mockResolvedValue(undefined);

    const response = await DELETE({} as Request, {
      params: Promise.resolve({ groupId: 'group-1', userId: 'member-2' }),
    });

    expect(response.status).toBe(204);
    expect(mockNextResponseJson).not.toHaveBeenCalled();
    expect(mockRemoveMember).toHaveBeenCalledWith(
      'group-1',
      'member-2',
      expect.objectContaining({
        membershipRepository: expect.any(Object),
        groupRepository: expect.any(Object),
      })
    );
  });

  it('対象メンバーが存在しない場合は404を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'member-1' },
    } as SessionOrUnauthorized);
    mockLeaveGroup.mockRejectedValue(new Error('メンバーシップが見つかりません'));

    const response = await DELETE({} as Request, {
      params: Promise.resolve({ groupId: 'group-1', userId: 'member-1' }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'NOT_FOUND', message: '対象のデータが見つかりません' },
    });
  });

  it('オーナーが脱退しようとした場合は403を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'owner-1' },
    } as SessionOrUnauthorized);
    mockLeaveGroup.mockRejectedValue(new Error('オーナーはグループから脱退できません'));

    const response = await DELETE({} as Request, {
      params: Promise.resolve({ groupId: 'group-1', userId: 'owner-1' }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'OWNER_CANNOT_LEAVE', message: 'オーナーはグループを脱退できません' },
    });
  });

  it('除外対象が存在しない場合は404を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'owner-1' },
    } as SessionOrUnauthorized);
    mockGetById.mockResolvedValue({ role: 'OWNER' });
    mockRemoveMember.mockRejectedValue(new Error('メンバーシップが見つかりません'));

    const response = await DELETE({} as Request, {
      params: Promise.resolve({ groupId: 'group-1', userId: 'member-2' }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'NOT_FOUND', message: '対象のデータが見つかりません' },
    });
  });

  it('想定外エラー時は500を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'owner-1' },
    } as SessionOrUnauthorized);
    mockGetById.mockResolvedValue({ role: 'OWNER' });
    mockRemoveMember.mockRejectedValue(new Error('unexpected error'));

    const response = await DELETE({} as Request, {
      params: Promise.resolve({ groupId: 'group-1', userId: 'member-2' }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'サーバーエラーが発生しました' },
    });
  });
});
