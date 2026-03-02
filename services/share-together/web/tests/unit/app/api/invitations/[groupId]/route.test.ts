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

jest.mock('@nagiyu/share-together-core', () => {
  const actualCore = jest.requireActual('@nagiyu/share-together-core');
  return {
    DynamoDBGroupRepository: jest.fn(),
    DynamoDBMembershipRepository: jest.fn(),
    respondToInvitation: jest.fn(),
    ERROR_MESSAGES: {
      INVITATION_NOT_FOUND: actualCore.ERROR_MESSAGES.INVITATION_NOT_FOUND,
      INVITATION_ALREADY_RESPONDED: actualCore.ERROR_MESSAGES.INVITATION_ALREADY_RESPONDED,
    },
  };
});

import {
  DynamoDBGroupRepository,
  DynamoDBMembershipRepository,
  ERROR_MESSAGES as GROUP_CORE_ERROR_MESSAGES,
  respondToInvitation,
} from '@nagiyu/share-together-core';
import { PUT } from '@/app/api/invitations/[groupId]/route';
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
const mockRespondToInvitation = respondToInvitation as jest.MockedFunction<typeof respondToInvitation>;
type SessionOrUnauthorized = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

describe('PUT /api/invitations/[groupId]', () => {
  beforeEach(() => {
    process.env.DYNAMODB_TABLE_NAME = 'test-share-together-main';
    mockGetAwsClients.mockReturnValue({
      docClient: { send: jest.fn() } as ReturnType<typeof getAwsClients>['docClient'],
    });
    mockDynamoDBGroupRepository.mockImplementation(
      () => ({}) as InstanceType<typeof DynamoDBGroupRepository>
    );
    mockDynamoDBMembershipRepository.mockImplementation(
      () => ({}) as InstanceType<typeof DynamoDBMembershipRepository>
    );
  });

  afterEach(() => {
    delete process.env.DYNAMODB_TABLE_NAME;
    jest.clearAllMocks();
  });

  it('未認証の場合は401レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      status: 401,
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: '認証が必要です' } }),
    } as SessionOrUnauthorized);

    const request = {
      json: jest.fn().mockResolvedValue({ action: 'ACCEPT' }),
    } as unknown as Request;
    const response = await PUT(request, { params: Promise.resolve({ groupId: 'group-1' }) });

    expect(response.status).toBe(401);
    expect(mockRespondToInvitation).not.toHaveBeenCalled();
  });

  it('actionが不正な場合は400レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);

    const request = {
      json: jest.fn().mockResolvedValue({ action: 'INVALID' }),
    } as unknown as Request;
    const response = await PUT(request, { params: Promise.resolve({ groupId: 'group-1' }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: '入力内容が不正です',
      },
    });
  });

  it('ACCEPT時に招待を承認して200レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    mockRespondToInvitation.mockResolvedValue({
      groupId: 'group-1',
      userId: 'user-1',
      role: 'MEMBER',
      status: 'ACCEPTED',
      invitedBy: 'owner-1',
      invitedAt: '2026-03-01T00:00:00.000Z',
      respondedAt: '2026-03-02T00:00:00.000Z',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
    });

    const request = {
      json: jest.fn().mockResolvedValue({ action: 'ACCEPT' }),
    } as unknown as Request;
    const response = await PUT(request, { params: Promise.resolve({ groupId: 'group-1' }) });

    expect(response.status).toBe(200);
    expect(mockRespondToInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
        userId: 'user-1',
        response: 'ACCEPT',
      }),
      expect.any(Object)
    );
    await expect(response.json()).resolves.toEqual({
      data: {
        groupId: 'group-1',
        status: 'ACCEPTED',
        updatedAt: '2026-03-02T00:00:00.000Z',
      },
    });
  });

  it('未処理招待がない場合は404レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    mockRespondToInvitation.mockRejectedValue(new Error(GROUP_CORE_ERROR_MESSAGES.INVITATION_NOT_FOUND));

    const request = {
      json: jest.fn().mockResolvedValue({ action: 'REJECT' }),
    } as unknown as Request;
    const response = await PUT(request, { params: Promise.resolve({ groupId: 'group-1' }) });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'NOT_FOUND',
        message: '対象のデータが見つかりません',
      },
    });
  });

  it('REJECT時に招待を拒否して200レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    mockRespondToInvitation.mockResolvedValue({
      groupId: 'group-1',
      userId: 'user-1',
      role: 'MEMBER',
      status: 'REJECTED',
      invitedBy: 'owner-1',
      invitedAt: '2026-03-01T00:00:00.000Z',
      respondedAt: '2026-03-02T00:00:00.000Z',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
    });

    const request = {
      json: jest.fn().mockResolvedValue({ action: 'REJECT' }),
    } as unknown as Request;
    const response = await PUT(request, { params: Promise.resolve({ groupId: 'group-1' }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        groupId: 'group-1',
        status: 'REJECTED',
        updatedAt: '2026-03-02T00:00:00.000Z',
      },
    });
  });

  it('既に応答済みの場合は409レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    mockRespondToInvitation.mockRejectedValue(
      new Error(GROUP_CORE_ERROR_MESSAGES.INVITATION_ALREADY_RESPONDED)
    );

    const request = {
      json: jest.fn().mockResolvedValue({ action: 'REJECT' }),
    } as unknown as Request;
    const response = await PUT(request, { params: Promise.resolve({ groupId: 'group-1' }) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'ALREADY_RESPONDED',
        message: 'この招待には既に応答済みです',
      },
    });
  });
});
