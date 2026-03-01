import { PutCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

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
  DynamoDBUserRepository: jest.fn(),
}));

import { DynamoDBUserRepository } from '@nagiyu/share-together-core';
import { POST } from '@/app/api/users/route';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getAwsClients } from '@/lib/aws-clients';

const mockGetSessionOrUnauthorized = getSessionOrUnauthorized as jest.MockedFunction<
  typeof getSessionOrUnauthorized
>;
const mockGetAwsClients = getAwsClients as jest.MockedFunction<typeof getAwsClients>;
const mockDynamoDBUserRepository = DynamoDBUserRepository as jest.MockedClass<
  typeof DynamoDBUserRepository
>;
type SessionOrUnauthorized = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

describe('POST /api/users', () => {
  const mockSend = jest.fn();
  const mockGetById = jest.fn();
  let randomUuidSpy: jest.SpiedFunction<typeof crypto.randomUUID> | null = null;

  beforeEach(() => {
    process.env.DYNAMODB_TABLE_NAME = 'test-share-together-main';
    mockGetAwsClients.mockReturnValue({
      docClient: { send: mockSend } as ReturnType<typeof getAwsClients>['docClient'],
    });
    mockDynamoDBUserRepository.mockImplementation(
      () =>
        ({
          getById: mockGetById,
        }) as InstanceType<typeof DynamoDBUserRepository>
    );
  });

  afterEach(() => {
    delete process.env.DYNAMODB_TABLE_NAME;
    randomUuidSpy?.mockRestore();
    randomUuidSpy = null;
    jest.clearAllMocks();
  });

  it('未認証の場合は401レスポンスを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      status: 401,
      json: async () => ({
        error: { code: 'UNAUTHORIZED', message: '認証が必要です' },
      }),
    } as SessionOrUnauthorized);

    const response = await POST();

    expect(response.status).toBe(401);
    expect(mockDynamoDBUserRepository).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('既存ユーザーの場合はプロフィールを更新して返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'updated@example.com',
        name: '更新ユーザー',
        image: 'https://example.com/new.png',
      },
    } as SessionOrUnauthorized);
    mockGetById.mockResolvedValue({
      userId: 'user-1',
      email: 'before@example.com',
      name: '更新前ユーザー',
      image: 'https://example.com/old.png',
      defaultListId: 'list-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockSend.mockResolvedValue({});

    const response = await POST();
    const command = mockSend.mock.calls[0]?.[0];

    expect(command).toBeInstanceOf(PutCommand);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: expect.objectContaining({
        userId: 'user-1',
        email: 'updated@example.com',
        name: '更新ユーザー',
        defaultListId: 'list-1',
      }),
    });
  });

  it('新規ユーザーの場合はユーザーとデフォルトリストを作成する', async () => {
    randomUuidSpy = jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('list-99');
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: {
        id: 'user-new',
        email: 'new@example.com',
        name: '新規ユーザー',
        image: null,
      },
    } as SessionOrUnauthorized);
    mockGetById.mockResolvedValue(null);
    mockSend.mockResolvedValue({});

    const response = await POST();
    const command = mockSend.mock.calls[0]?.[0] as TransactWriteCommand;

    expect(command).toBeInstanceOf(TransactWriteCommand);
    expect(command.input.TransactItems).toHaveLength(2);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: expect.objectContaining({
        userId: 'user-new',
        defaultListId: 'list-99',
      }),
    });
  });
});
