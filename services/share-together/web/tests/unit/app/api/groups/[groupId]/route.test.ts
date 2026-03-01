jest.mock('next/server', () => ({
  NextResponse: class {
    public readonly status: number;
    private readonly body: unknown;

    constructor(body: unknown, init?: { status?: number }) {
      this.status = init?.status ?? 200;
      this.body = body;
    }

    public static json(body: unknown, init?: { status?: number }) {
      return {
        status: init?.status ?? 200,
        json: async () => body,
      };
    }

    public async json() {
      return this.body;
    }
  },
}));

jest.mock('@/lib/auth/session', () => ({
  getSessionOrUnauthorized: jest.fn(),
}));

jest.mock('@/lib/aws-clients', () => ({
  getAwsClients: jest.fn(),
}));

jest.mock('@nagiyu/share-together-core', () => ({
  DynamoDBGroupRepository: jest.fn(),
  DynamoDBMembershipRepository: jest.fn(),
}));

import { DELETE, PUT } from '@/app/api/groups/[groupId]/route';
import {
  DynamoDBGroupRepository,
  DynamoDBMembershipRepository,
} from '@nagiyu/share-together-core';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getAwsClients } from '@/lib/aws-clients';

const mockGetSessionOrUnauthorized = getSessionOrUnauthorized as jest.MockedFunction<
  typeof getSessionOrUnauthorized
>;
const mockGetAwsClients = getAwsClients as jest.MockedFunction<typeof getAwsClients>;
const mockDynamoDBGroupRepository = DynamoDBGroupRepository as jest.MockedClass<
  typeof DynamoDBGroupRepository
>;
const mockDynamoDBMembershipRepository = DynamoDBMembershipRepository as jest.MockedClass<
  typeof DynamoDBMembershipRepository
>;
type SessionOrUnauthorized = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

describe('/api/groups/[groupId] route handlers', () => {
  const mockGetById = jest.fn();
  const mockUpdate = jest.fn();
  const mockDelete = jest.fn();
  const mockDeleteByGroupId = jest.fn();

  beforeEach(() => {
    process.env.DYNAMODB_TABLE_NAME = 'test-share-together-main';
    mockGetAwsClients.mockReturnValue({
      docClient: { send: jest.fn() } as ReturnType<typeof getAwsClients>['docClient'],
    });

    mockDynamoDBGroupRepository.mockImplementation(
      () =>
        ({
          getById: mockGetById,
          update: mockUpdate,
          delete: mockDelete,
        }) as InstanceType<typeof DynamoDBGroupRepository>
    );
    mockDynamoDBMembershipRepository.mockImplementation(
      () =>
        ({
          deleteByGroupId: mockDeleteByGroupId,
        }) as InstanceType<typeof DynamoDBMembershipRepository>
    );
  });

  afterEach(() => {
    delete process.env.DYNAMODB_TABLE_NAME;
    jest.clearAllMocks();
  });

  it('PUT: オーナーがグループ名を更新できる', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'owner-1' },
    } as SessionOrUnauthorized);
    mockGetById.mockResolvedValue({
      groupId: 'group-1',
      name: '更新前',
      ownerUserId: 'owner-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockUpdate.mockResolvedValue({
      groupId: 'group-1',
      name: '更新後',
      ownerUserId: 'owner-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const response = await PUT(
      {
        json: async () => ({ name: '更新後' }),
      } as Request,
      { params: Promise.resolve({ groupId: 'group-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: expect.objectContaining({
        groupId: 'group-1',
        name: '更新後',
      }),
    });
    expect(mockUpdate).toHaveBeenCalledWith('group-1', { name: '更新後' });
  });

  it('PUT: オーナー以外は403 OWNER_ONLYを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'member-1' },
    } as SessionOrUnauthorized);
    mockGetById.mockResolvedValue({
      groupId: 'group-1',
      name: 'グループ',
      ownerUserId: 'owner-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const response = await PUT(
      {
        json: async () => ({ name: '更新後' }),
      } as Request,
      { params: Promise.resolve({ groupId: 'group-1' }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'OWNER_ONLY',
        message: 'この操作はオーナーのみ実行できます',
        details: undefined,
      },
    });
  });

  it('DELETE: オーナーはグループを削除できる', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'owner-1' },
    } as SessionOrUnauthorized);
    mockGetById.mockResolvedValue({
      groupId: 'group-1',
      name: 'グループ',
      ownerUserId: 'owner-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockDeleteByGroupId.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);

    const response = await DELETE({} as Request, {
      params: Promise.resolve({ groupId: 'group-1' }),
    });

    expect(response.status).toBe(204);
    expect(mockDeleteByGroupId).toHaveBeenCalledWith('group-1');
    expect(mockDelete).toHaveBeenCalledWith('group-1');
  });

  it('DELETE: オーナー以外は403 OWNER_ONLYを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'member-1' },
    } as SessionOrUnauthorized);
    mockGetById.mockResolvedValue({
      groupId: 'group-1',
      name: 'グループ',
      ownerUserId: 'owner-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const response = await DELETE({} as Request, {
      params: Promise.resolve({ groupId: 'group-1' }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'OWNER_ONLY',
        message: 'この操作はオーナーのみ実行できます',
        details: undefined,
      },
    });
    expect(mockDeleteByGroupId).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('PUT: name が不正な場合は400を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'owner-1' },
    } as SessionOrUnauthorized);
    mockGetById.mockResolvedValue({
      groupId: 'group-1',
      name: 'グループ',
      ownerUserId: 'owner-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const response = await PUT(
      {
        json: async () => ({ name: '' }),
      } as Request,
      { params: Promise.resolve({ groupId: 'group-1' }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: '入力内容が不正です',
        details: undefined,
      },
    });
  });
});
