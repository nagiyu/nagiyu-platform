import { GET } from '@/app/api/users/me/route';
import { auth } from '@/lib/auth/auth';
import { DynamoDBUserRepository } from '@/lib/db/repositories/dynamodb-user-repository';

// Mock dependencies
jest.mock('@/lib/auth/auth');
jest.mock('@/lib/db/repositories/dynamodb-user-repository');

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDynamoDBUserRepository =
  DynamoDBUserRepository as jest.MockedClass<typeof DynamoDBUserRepository>;

describe('GET /api/users/me', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('未認証の場合は401を返す', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe('認証が必要です');
  });

  it('ユーザーが存在しない場合は404を返す', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        roles: [],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const mockGetUserById = jest.fn().mockResolvedValue(null);
    mockDynamoDBUserRepository.prototype.getUserById = mockGetUserById;

    const response = await GET();

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe('ユーザーが見つかりません');
  });

  it('正常な場合は現在のユーザー情報を返す', async () => {
    const mockUser = {
      userId: 'user-1',
      googleId: 'google-1',
      email: 'test@example.com',
      name: 'Test User',
      roles: ['user-manager'],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    mockAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['user-manager'],
      },
      expires: '2024-12-31T23:59:59.999Z',
    });

    const mockGetUserById = jest.fn().mockResolvedValue(mockUser);
    mockDynamoDBUserRepository.prototype.getUserById = mockGetUserById;

    const response = await GET();

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual(mockUser);
    expect(mockGetUserById).toHaveBeenCalledWith('user-1');
  });
});
