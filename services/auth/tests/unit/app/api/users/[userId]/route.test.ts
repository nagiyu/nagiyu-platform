import { NextRequest } from 'next/server';
import { GET, PATCH, DELETE } from '@/app/api/users/[userId]/route';
import { auth } from '@/lib/auth/auth';
import { DynamoDBUserRepository } from '@/lib/db/repositories/dynamodb-user-repository';

// Mock dependencies
jest.mock('@/lib/auth/auth');
jest.mock('@/lib/db/repositories/dynamodb-user-repository');

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDynamoDBUserRepository =
  DynamoDBUserRepository as jest.MockedClass<typeof DynamoDBUserRepository>;

describe('GET /api/users/[userId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('未認証の場合は401を返す', async () => {
    mockAuth.mockResolvedValue(null);

    const req = new NextRequest('http://localhost:3000/api/users/user-1');
    const response = await GET(req, { params: Promise.resolve({ userId: 'user-1' }) });

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

    const req = new NextRequest('http://localhost:3000/api/users/user-1');
    const response = await GET(req, { params: Promise.resolve({ userId: 'user-1' }) });

    expect(response.status).toBe(403);
  });

  it('ユーザーが存在しない場合は404を返す', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        roles: ['admin'],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const mockGetUserById = jest.fn().mockResolvedValue(null);
    mockDynamoDBUserRepository.prototype.getUserById = mockGetUserById;

    const req = new NextRequest('http://localhost:3000/api/users/user-999');
    const response = await GET(req, { params: Promise.resolve({ userId: 'user-999' }) });

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe('ユーザーが見つかりません');
  });

  it('正常な場合はユーザー詳細を返す', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        roles: ['admin'],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const mockUser = {
      userId: 'user-2',
      googleId: 'google-2',
      email: 'test@example.com',
      name: 'Test User',
      roles: ['user-manager'],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    const mockGetUserById = jest.fn().mockResolvedValue(mockUser);
    mockDynamoDBUserRepository.prototype.getUserById = mockGetUserById;

    const req = new NextRequest('http://localhost:3000/api/users/user-2');
    const response = await GET(req, { params: Promise.resolve({ userId: 'user-2' }) });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual(mockUser);
  });
});

describe('PATCH /api/users/[userId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('未認証の場合は401を返す', async () => {
    mockAuth.mockResolvedValue(null);

    const req = new NextRequest('http://localhost:3000/api/users/user-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New Name' }),
    });
    const response = await PATCH(req, { params: Promise.resolve({ userId: 'user-1' }) });

    expect(response.status).toBe(401);
  });

  it('users:write権限がない場合は403を返す', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        roles: [],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const req = new NextRequest('http://localhost:3000/api/users/user-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New Name' }),
    });
    const response = await PATCH(req, { params: Promise.resolve({ userId: 'user-1' }) });

    expect(response.status).toBe(403);
  });

  it('nameが100文字を超える場合は400を返す', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        roles: ['admin'],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const longName = 'a'.repeat(101);
    const req = new NextRequest('http://localhost:3000/api/users/user-2', {
      method: 'PATCH',
      body: JSON.stringify({ name: longName }),
    });
    const response = await PATCH(req, { params: Promise.resolve({ userId: 'user-2' }) });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('名前は1〜100文字で入力してください');
  });

  it('rolesが配列でない場合は400を返す', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        roles: ['admin'],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const req = new NextRequest('http://localhost:3000/api/users/user-2', {
      method: 'PATCH',
      body: JSON.stringify({ roles: 'admin' }),
    });
    const response = await PATCH(req, { params: Promise.resolve({ userId: 'user-2' }) });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('ロールが不正です');
  });

  it('roles:assign権限なしでロールを変更しようとすると403を返す', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User Manager',
        roles: ['user-manager'],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const req = new NextRequest('http://localhost:3000/api/users/user-2', {
      method: 'PATCH',
      body: JSON.stringify({ roles: ['admin'] }),
    });
    const response = await PATCH(req, { params: Promise.resolve({ userId: 'user-2' }) });

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.details).toBe('Required permission: roles:assign');
  });

  it('自分自身のロールを変更しようとすると400を返す', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        roles: ['admin'],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const req = new NextRequest('http://localhost:3000/api/users/user-1', {
      method: 'PATCH',
      body: JSON.stringify({ roles: ['user-manager'] }),
    });
    const response = await PATCH(req, { params: Promise.resolve({ userId: 'user-1' }) });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('自分自身のロールを変更することはできません');
  });

  it('正常な場合はユーザー情報を更新する', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        roles: ['admin'],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const updatedUser = {
      userId: 'user-2',
      googleId: 'google-2',
      email: 'test@example.com',
      name: 'Updated Name',
      roles: ['user-manager'],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-15T00:00:00.000Z',
    };

    const mockUpdateUser = jest.fn().mockResolvedValue(updatedUser);
    mockDynamoDBUserRepository.prototype.updateUser = mockUpdateUser;

    const req = new NextRequest('http://localhost:3000/api/users/user-2', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated Name' }),
    });
    const response = await PATCH(req, { params: Promise.resolve({ userId: 'user-2' }) });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual(updatedUser);
    expect(mockUpdateUser).toHaveBeenCalledWith('user-2', { name: 'Updated Name' });
  });
});

describe('DELETE /api/users/[userId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('未認証の場合は401を返す', async () => {
    mockAuth.mockResolvedValue(null);

    const req = new NextRequest('http://localhost:3000/api/users/user-1', {
      method: 'DELETE',
    });
    const response = await DELETE(req, { params: Promise.resolve({ userId: 'user-1' }) });

    expect(response.status).toBe(401);
  });

  it('users:write権限がない場合は403を返す', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        roles: [],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const req = new NextRequest('http://localhost:3000/api/users/user-1', {
      method: 'DELETE',
    });
    const response = await DELETE(req, { params: Promise.resolve({ userId: 'user-1' }) });

    expect(response.status).toBe(403);
  });

  it('自分自身を削除しようとすると400を返す', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        roles: ['admin'],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const req = new NextRequest('http://localhost:3000/api/users/user-1', {
      method: 'DELETE',
    });
    const response = await DELETE(req, { params: Promise.resolve({ userId: 'user-1' }) });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('自分自身を削除することはできません');
  });

  it('ユーザーが存在しない場合は404を返す', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        roles: ['admin'],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const mockGetUserById = jest.fn().mockResolvedValue(null);
    mockDynamoDBUserRepository.prototype.getUserById = mockGetUserById;

    const req = new NextRequest('http://localhost:3000/api/users/user-999', {
      method: 'DELETE',
    });
    const response = await DELETE(req, { params: Promise.resolve({ userId: 'user-999' }) });

    expect(response.status).toBe(404);
  });

  it('最後の管理者を削除しようとすると400を返す', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        roles: ['admin'],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const adminUser = {
      userId: 'user-2',
      googleId: 'google-2',
      email: 'admin2@example.com',
      name: 'Admin User 2',
      roles: ['admin'],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    const mockGetUserById = jest.fn().mockResolvedValue(adminUser);
    const mockListUsers = jest.fn().mockResolvedValue({
      users: [adminUser],
      lastEvaluatedKey: undefined,
    });

    mockDynamoDBUserRepository.prototype.getUserById = mockGetUserById;
    mockDynamoDBUserRepository.prototype.listUsers = mockListUsers;

    const req = new NextRequest('http://localhost:3000/api/users/user-2', {
      method: 'DELETE',
    });
    const response = await DELETE(req, { params: Promise.resolve({ userId: 'user-2' }) });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('最後の管理者を削除することはできません');
  });

  it('正常な場合はユーザーを削除する', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        roles: ['admin'],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const userToDelete = {
      userId: 'user-2',
      googleId: 'google-2',
      email: 'test@example.com',
      name: 'Test User',
      roles: ['user-manager'],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    const mockGetUserById = jest.fn().mockResolvedValue(userToDelete);
    const mockDeleteUser = jest.fn().mockResolvedValue(undefined);

    mockDynamoDBUserRepository.prototype.getUserById = mockGetUserById;
    mockDynamoDBUserRepository.prototype.deleteUser = mockDeleteUser;

    const req = new NextRequest('http://localhost:3000/api/users/user-2', {
      method: 'DELETE',
    });
    const response = await DELETE(req, { params: Promise.resolve({ userId: 'user-2' }) });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.message).toBe('User deleted successfully');
    expect(mockDeleteUser).toHaveBeenCalledWith('user-2');
  });
});
