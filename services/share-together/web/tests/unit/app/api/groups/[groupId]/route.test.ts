/**
 * @jest-environment node
 */

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

jest.mock('@nagiyu/aws', () => ({
  EntityNotFoundError: jest.requireActual('@nagiyu/aws').EntityNotFoundError,
  getDynamoDBDocumentClient: jest.fn(),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('@nagiyu/share-together-core', () => ({
  DynamoDBGroupRepository: jest.fn(),
  createGroupRepository: jest.fn(),
  DynamoDBMembershipRepository: jest.fn(),
  createMembershipRepository: jest.fn(),
}));

import { DELETE, PUT } from '@/app/api/groups/[groupId]/route';
import { DynamoDBGroupRepository, DynamoDBMembershipRepository } from '@nagiyu/share-together-core';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { EntityNotFoundError, getDynamoDBDocumentClient, reportErrorEvent } from '@nagiyu/aws';

const mockGetSessionOrUnauthorized = getSessionOrUnauthorized as jest.MockedFunction<
  typeof getSessionOrUnauthorized
>;
const mockGetDynamoDBDocumentClient = getDynamoDBDocumentClient as jest.MockedFunction<
  typeof getDynamoDBDocumentClient
>;
const mockReportErrorEvent = reportErrorEvent as jest.MockedFunction<typeof reportErrorEvent>;
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
type SessionOrUnauthorized = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

import {
  createRequestWithJson,
  MALFORMED_BODY_CASES,
  type InvalidBodyCase,
} from '../../invalidBodyCases';

describe('/api/groups/[groupId] route handlers', () => {
  const mockGetById = jest.fn();
  const mockUpdate = jest.fn();
  const mockDelete = jest.fn();
  const mockDeleteByGroupId = jest.fn();

  beforeEach(() => {
    process.env.DYNAMODB_TABLE_NAME = 'test-share-together-main';
    mockGetDynamoDBDocumentClient.mockReturnValue({ send: jest.fn() } as ReturnType<
      typeof getDynamoDBDocumentClient
    >);

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
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });
    mockUpdate.mockResolvedValue({
      groupId: 'group-1',
      name: '更新後',
      ownerUserId: 'owner-1',
      createdAt: 1767225600000,
      updatedAt: 1767312000000,
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
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });

    const response = await PUT(
      {
        json: async () => ({ name: '更新後' }),
      } as Request,
      { params: Promise.resolve({ groupId: 'group-1' }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'OWNER_ONLY',
      message: 'この操作はオーナーのみ実行できます',
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
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
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
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });

    const response = await DELETE({} as Request, {
      params: Promise.resolve({ groupId: 'group-1' }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'OWNER_ONLY',
      message: 'この操作はオーナーのみ実行できます',
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
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });

    const response = await PUT(
      {
        json: async () => ({ name: '' }),
      } as Request,
      { params: Promise.resolve({ groupId: 'group-1' }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'VALIDATION_ERROR',
      message: '入力内容が不正です',
    });
  });

  it('PUT: 更新時にグループが消えていた場合は404を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'owner-1' },
    } as SessionOrUnauthorized);
    mockGetById.mockResolvedValue({
      groupId: 'group-1',
      name: '更新前',
      ownerUserId: 'owner-1',
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });
    mockUpdate.mockRejectedValue(new EntityNotFoundError('Group', 'group-1'));

    const response = await PUT({ json: async () => ({ name: '更新後' }) } as Request, {
      params: Promise.resolve({ groupId: 'group-1' }),
    });

    expect(response.status).toBe(404);
    expect(mockReportErrorEvent).not.toHaveBeenCalled();
  });

  it('DELETE: 削除時にグループが消えていた場合は404を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'owner-1' },
    } as SessionOrUnauthorized);
    mockGetById.mockResolvedValue({
      groupId: 'group-1',
      name: 'グループ',
      ownerUserId: 'owner-1',
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });
    mockDeleteByGroupId.mockResolvedValue(undefined);
    mockDelete.mockRejectedValue(new EntityNotFoundError('Group', 'group-1'));

    const response = await DELETE({} as Request, {
      params: Promise.resolve({ groupId: 'group-1' }),
    });

    expect(response.status).toBe(404);
    expect(mockReportErrorEvent).not.toHaveBeenCalled();
  });

  it('PUT: 例外発生時は500レスポンスを返し reportErrorEvent を呼ぶ', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'owner-1' },
    } as SessionOrUnauthorized);
    mockGetById.mockRejectedValue(new Error('DynamoDB 接続エラー'));

    const response = await PUT({ json: async () => ({ name: '更新後' }) } as Request, {
      params: Promise.resolve({ groupId: 'group-1' }),
    });

    expect(response.status).toBe(500);
    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 'share-together', severity: 'error' })
    );
  });

  it('DELETE: 例外発生時は500レスポンスを返し reportErrorEvent を呼ぶ', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'owner-1' },
    } as SessionOrUnauthorized);
    mockGetById.mockRejectedValue(new Error('DynamoDB 接続エラー'));

    const response = await DELETE({} as Request, {
      params: Promise.resolve({ groupId: 'group-1' }),
    });

    expect(response.status).toBe(500);
    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 'share-together', severity: 'error' })
    );
  });

  it('PUT: 空白で囲まれた100文字の名前は trim 後の値で保存する', async () => {
    const trimmedName = 'あ'.repeat(100);
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'owner-1' },
    } as SessionOrUnauthorized);
    mockGetById.mockResolvedValue({
      groupId: 'group-1',
      name: 'グループ',
      ownerUserId: 'owner-1',
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });
    mockUpdate.mockResolvedValue({ groupId: 'group-1', name: trimmedName });

    const response = await PUT({ json: async () => ({ name: `  ${trimmedName}  ` }) } as Request, {
      params: Promise.resolve({ groupId: 'group-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith('group-1', { name: trimmedName });
  });

  it('PUT: trim 後に101文字になる名前は400を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'owner-1' },
    } as SessionOrUnauthorized);
    mockGetById.mockResolvedValue({
      groupId: 'group-1',
      name: 'グループ',
      ownerUserId: 'owner-1',
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });

    const response = await PUT(
      { json: async () => ({ name: ` ${'あ'.repeat(101)} ` }) } as Request,
      { params: Promise.resolve({ groupId: 'group-1' }) }
    );

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it.each<InvalidBodyCase>([...MALFORMED_BODY_CASES, ['name が数値', async () => ({ name: 123 })]])(
    'PUT: リクエストボディが不正な場合 (%s) は400を返す',
    async (_label, json) => {
      mockGetSessionOrUnauthorized.mockResolvedValue({
        user: { id: 'owner-1' },
      } as SessionOrUnauthorized);
      mockGetById.mockResolvedValue({
        groupId: 'group-1',
        name: 'グループ',
        ownerUserId: 'owner-1',
        createdAt: 1767225600000,
        updatedAt: 1767225600000,
      });

      const response = await PUT(createRequestWithJson(json), {
        params: Promise.resolve({ groupId: 'group-1' }),
      });

      expect(response.status).toBe(400);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockReportErrorEvent).not.toHaveBeenCalled();
    }
  );
});
