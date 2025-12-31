import { NextRequest } from 'next/server';
import { GET } from '@/app/api/users/route';
import { auth } from '@/lib/auth/auth';
import { DynamoDBUserRepository } from '@/lib/db/repositories/dynamodb-user-repository';

// Mock dependencies
jest.mock('@/lib/auth/auth');
jest.mock('@/lib/db/repositories/dynamodb-user-repository');

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDynamoDBUserRepository =
  DynamoDBUserRepository as jest.MockedClass<typeof DynamoDBUserRepository>;

describe('GET /api/users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('未認証の場合は401を返す', async () => {
    mockAuth.mockResolvedValue(null);

    const req = new NextRequest('http://localhost:3000/api/users');
    const response = await GET(req);

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe('認証が必要です');
  });

  it('users:read権限がない場合は403を返す', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        roles: [],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const req = new NextRequest('http://localhost:3000/api/users');
    const response = await GET(req);

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toBe('この操作を実行する権限がありません');
  });

  it('limitが1未満の場合は400を返す', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        roles: ['admin'],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const req = new NextRequest('http://localhost:3000/api/users?limit=0');
    const response = await GET(req);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('取得件数は1〜100の範囲で指定してください');
  });

  it('limitが100を超える場合は400を返す', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        roles: ['admin'],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const req = new NextRequest('http://localhost:3000/api/users?limit=101');
    const response = await GET(req);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('取得件数は1〜100の範囲で指定してください');
  });

  it('正常な場合はユーザー一覧を返す', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        roles: ['admin'],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const mockUsers = [
      {
        userId: 'user-1',
        googleId: 'google-1',
        email: 'admin@example.com',
        name: 'Admin User',
        roles: ['admin'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        userId: 'user-2',
        googleId: 'google-2',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['user-manager'],
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      },
    ];

    const mockListUsers = jest.fn().mockResolvedValue({
      users: mockUsers,
      lastEvaluatedKey: undefined,
    });

    mockDynamoDBUserRepository.prototype.listUsers = mockListUsers;

    const req = new NextRequest('http://localhost:3000/api/users');
    const response = await GET(req);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.users).toEqual(mockUsers);
    expect(json.nextToken).toBeUndefined();
    expect(mockListUsers).toHaveBeenCalledWith(100, undefined);
  });

  it('nextTokenがある場合はページネーションされる', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        roles: ['admin'],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const mockUsers = [
      {
        userId: 'user-3',
        googleId: 'google-3',
        email: 'user3@example.com',
        name: 'User 3',
        roles: [],
        createdAt: '2024-01-03T00:00:00.000Z',
        updatedAt: '2024-01-03T00:00:00.000Z',
      },
    ];

    const lastEvaluatedKey = { userId: 'user-3' };

    const mockListUsers = jest.fn().mockResolvedValue({
      users: mockUsers,
      lastEvaluatedKey: lastEvaluatedKey,
    });

    mockDynamoDBUserRepository.prototype.listUsers = mockListUsers;

    const req = new NextRequest('http://localhost:3000/api/users?limit=50');
    const response = await GET(req);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.users).toEqual(mockUsers);
    expect(json.nextToken).toBeDefined();
    expect(mockListUsers).toHaveBeenCalledWith(50, undefined);

    // nextToken をデコードして検証
    const decodedToken = JSON.parse(Buffer.from(json.nextToken, 'base64').toString());
    expect(decodedToken).toEqual(lastEvaluatedKey);
  });
});
