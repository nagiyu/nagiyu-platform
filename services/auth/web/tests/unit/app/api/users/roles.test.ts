/**
 * Unit tests for POST /api/users/[userId]/roles endpoint
 *
 * NOTE: jest.config.ts の testPathIgnorePatterns により自動テストランナーから除外されている。
 * 個別に実行する場合は --testPathIgnorePatterns=/node_modules/ を指定する。
 *
 * @jest-environment node
 */

import { UserNotFoundError } from '@nagiyu/auth-core';
import { POST } from '../../../../../src/app/api/users/[userId]/roles/route';
import { USER_VALIDATION_ERROR_MESSAGES } from '../../../../../src/app/api/users/schemas';

const mockGetSession = jest.fn();
const mockAssignRoles = jest.fn();
const mockHasPermission = jest.fn();
const mockReportErrorEvent = jest.fn().mockResolvedValue(null);

// jest.mock は import より前に巻き上げられるため、モック関数はファクトリ内で直接参照せず、呼び出し時に参照する
jest.mock('@nagiyu/auth-core', () => ({
  createUserRepository: jest.fn(() => ({
    assignRoles: (...args: unknown[]) => mockAssignRoles(...args),
  })),
  UserNotFoundError: class UserNotFoundError extends Error {
    constructor(userId: string) {
      super(`ユーザーが見つかりません: ${userId}`);
      this.name = 'UserNotFoundError';
    }
  },
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: (...args: unknown[]) => mockReportErrorEvent(...args),
}));

jest.mock('@nagiyu/common', () => ({
  ...jest.requireActual('@nagiyu/common'),
  VALID_ROLES: ['admin', 'user-manager'],
  hasPermission: (...args: unknown[]) => mockHasPermission(...args),
}));

jest.mock('../../../../../src/lib/auth/session', () => ({
  getSession: () => mockGetSession(),
}));

describe('POST /api/users/[userId]/roles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReportErrorEvent.mockResolvedValue(null);
  });

  describe('認証チェック', () => {
    it('未認証の場合は 401 を返す', async () => {
      mockGetSession.mockResolvedValue(null);

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
      mockGetSession.mockResolvedValue({
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
      mockGetSession.mockResolvedValue({
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
      mockGetSession.mockResolvedValue({
        user: {
          id: 'admin-123',
          roles: ['admin'],
        },
      });
      mockHasPermission.mockReturnValue(true);
    });

    it('ユーザーが見つからない場合は 404 を返す', async () => {
      mockAssignRoles.mockRejectedValue(new UserNotFoundError('user-999'));

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
      mockGetSession.mockResolvedValue({
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
      mockGetSession.mockResolvedValue({
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

  describe('不正なリクエストボディ', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({ user: { id: 'admin-123', roles: ['admin'] } });
      mockHasPermission.mockReturnValue(true);
    });

    const postRaw = (rawBody: string) =>
      POST(
        new Request('http://localhost/api/users/user-456/roles', {
          method: 'POST',
          body: rawBody,
        }) as unknown as Parameters<typeof POST>[0],
        { params: Promise.resolve({ userId: 'user-456' }) }
      );

    it.each([
      ['壊れた JSON', '{"roles": ['],
      ['空のボディ', ''],
      ['null', 'null'],
      ['配列', '["admin"]'],
      ['文字列', '"admin"'],
    ])('ボディが %s の場合は 400 を返し、リポジトリも通報も呼ばない', async (_label, rawBody) => {
      const response = await postRaw(rawBody);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'リクエストボディが不正です',
        details: [{ field: '', message: USER_VALIDATION_ERROR_MESSAGES.BODY_NOT_OBJECT }],
      });
      expect(mockAssignRoles).not.toHaveBeenCalled();
      expect(mockReportErrorEvent).not.toHaveBeenCalled();
    });

    it.each([
      ['roles が数値', { roles: 1 }, 'roles', USER_VALIDATION_ERROR_MESSAGES.ROLES_NOT_ARRAY],
      ['roles が null', { roles: null }, 'roles', USER_VALIDATION_ERROR_MESSAGES.ROLES_NOT_ARRAY],
      [
        'roles の要素が数値',
        { roles: ['admin', 1] },
        'roles.1',
        USER_VALIDATION_ERROR_MESSAGES.ROLE_NOT_STRING,
      ],
    ])('%s の場合は日本語の定数メッセージで 400 を返す', async (_label, body, field, message) => {
      const response = await postRaw(JSON.stringify(body));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'リクエストボディが不正です',
        details: [{ field, message }],
      });
      expect(mockAssignRoles).not.toHaveBeenCalled();
      expect(mockReportErrorEvent).not.toHaveBeenCalled();
    });
  });
});
