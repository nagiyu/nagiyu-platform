/**
 * Unit tests for POST /api/users/[userId]/roles endpoint
 */

import { POST } from '../../../../../src/app/api/users/[userId]/roles/route';

// Mock dependencies before importing
const mockAuth = jest.fn();
const mockAssignRoles = jest.fn();
const mockHasPermission = jest.fn();

class MockUserNotFoundError extends Error {
  constructor(userId: string) {
    super(`ユーザーが見つかりません: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

jest.mock('@nagiyu/auth-core', () => ({
  auth: mockAuth,
  DynamoDBUserRepository: jest.fn().mockImplementation(() => ({
    assignRoles: mockAssignRoles,
  })),
  UserNotFoundError: MockUserNotFoundError,
}));

jest.mock('@nagiyu/common', () => ({
  VALID_ROLES: ['admin', 'user-manager'],
  hasPermission: mockHasPermission,
}));

describe('POST /api/users/[userId]/roles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('認証チェック', () => {
    it('未認証の場合は 401 を返す', async () => {
      mockAuth.mockResolvedValue(null);

      const request = new Request('http://localhost/api/users/user-123/roles', {
        method: 'POST',
        body: JSON.stringify({ roles: ['admin'] }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ userId: 'user-123' }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('認証が必要です');
    });
  });

  describe('権限チェック', () => {
    it('roles:assign 権限がない場合は 403 を返す', async () => {
      mockAuth.mockResolvedValue({
        user: {
          id: 'user-123',
          roles: ['user-manager'],
        },
      });
      mockHasPermission.mockReturnValue(false);

      const request = new Request('http://localhost/api/users/user-456/roles', {
        method: 'POST',
        body: JSON.stringify({ roles: ['admin'] }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ userId: 'user-456' }),
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('この操作を実行する権限がありません');
      expect(data.details).toBe('Required permission: roles:assign');
    });
  });

  describe('ロールバリデーション', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({
        user: {
          id: 'admin-123',
          roles: ['admin'],
        },
      });
      mockHasPermission.mockReturnValue(true);
    });

    it('無効なロールの場合は 400 を返す', async () => {
      const request = new Request('http://localhost/api/users/user-456/roles', {
        method: 'POST',
        body: JSON.stringify({ roles: ['invalid-role', 'another-invalid'] }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ userId: 'user-456' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('無効なロールが含まれています');
      expect(data.validRoles).toEqual(['admin', 'user-manager']);
    });

    it('有効なロールの場合はバリデーションを通過する', async () => {
      mockAssignRoles.mockResolvedValue({
        userId: 'user-456',
        email: 'user@example.com',
        name: 'Test User',
        roles: ['admin', 'user-manager'],
        updatedAt: '2024-01-15T12:00:00Z',
      });

      const request = new Request('http://localhost/api/users/user-456/roles', {
        method: 'POST',
        body: JSON.stringify({ roles: ['admin', 'user-manager'] }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ userId: 'user-456' }),
      });

      expect(response.status).toBe(200);
      expect(mockAssignRoles).toHaveBeenCalledWith('user-456', ['admin', 'user-manager']);
    });

    it('空の配列は許可される', async () => {
      mockAssignRoles.mockResolvedValue({
        userId: 'user-456',
        email: 'user@example.com',
        name: 'Test User',
        roles: [],
        updatedAt: '2024-01-15T12:00:00Z',
      });

      const request = new Request('http://localhost/api/users/user-456/roles', {
        method: 'POST',
        body: JSON.stringify({ roles: [] }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ userId: 'user-456' }),
      });

      expect(response.status).toBe(200);
      expect(mockAssignRoles).toHaveBeenCalledWith('user-456', []);
    });
  });

  describe('ユーザー不存在エラー', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({
        user: {
          id: 'admin-123',
          roles: ['admin'],
        },
      });
      mockHasPermission.mockReturnValue(true);
    });

    it('ユーザーが見つからない場合は 404 を返す', async () => {
      mockAssignRoles.mockRejectedValue(new MockUserNotFoundError('user-999'));

      const request = new Request('http://localhost/api/users/user-999/roles', {
        method: 'POST',
        body: JSON.stringify({ roles: ['admin'] }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ userId: 'user-999' }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('ユーザーが見つかりません');
    });
  });

  describe('成功レスポンス', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({
        user: {
          id: 'admin-123',
          roles: ['admin'],
        },
      });
      mockHasPermission.mockReturnValue(true);
    });

    it('有効なロール割り当ては成功する', async () => {
      const mockUpdatedUser = {
        userId: 'user-456',
        email: 'user@example.com',
        name: 'Test User',
        roles: ['admin'],
        updatedAt: '2024-01-15T12:00:00Z',
      };

      mockAssignRoles.mockResolvedValue(mockUpdatedUser);

      const request = new Request('http://localhost/api/users/user-456/roles', {
        method: 'POST',
        body: JSON.stringify({ roles: ['admin'] }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ userId: 'user-456' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual(mockUpdatedUser);
    });
  });

  describe('Zodバリデーションエラー', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({
        user: {
          id: 'admin-123',
          roles: ['admin'],
        },
      });
      mockHasPermission.mockReturnValue(true);
    });

    it('roles が配列でない場合は 400 を返す', async () => {
      const request = new Request('http://localhost/api/users/user-456/roles', {
        method: 'POST',
        body: JSON.stringify({ roles: 'not-an-array' }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ userId: 'user-456' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('リクエストボディが不正です');
      expect(data.details).toBeDefined();
    });

    it('roles フィールドが欠けている場合は 400 を返す', async () => {
      const request = new Request('http://localhost/api/users/user-456/roles', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request, {
        params: Promise.resolve({ userId: 'user-456' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('リクエストボディが不正です');
    });
  });
});
