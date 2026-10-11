/**
 * Unit tests for PATCH /api/users/[userId] endpoint
 *
 * @jest-environment node
 */

import { UserNotFoundError } from '@nagiyu/auth-core';
import { PATCH } from '../../../../../src/app/api/users/[userId]/route';
import { USER_VALIDATION_ERROR_MESSAGES } from '../../../../../src/app/api/users/schemas';

const mockGetSession = jest.fn();
const mockUpdateUser = jest.fn();
const mockHasPermission = jest.fn();
const mockReportErrorEvent = jest.fn().mockResolvedValue(null);

// jest.mock は import より前に巻き上げられるため、モック関数はファクトリ内で直接参照せず、呼び出し時に参照する
jest.mock('@nagiyu/auth-core', () => ({
  createUserRepository: jest.fn(() => ({
    updateUser: (...args: unknown[]) => mockUpdateUser(...args),
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
  hasPermission: (...args: unknown[]) => mockHasPermission(...args),
}));

jest.mock('../../../../../src/lib/auth/session', () => ({
  getSession: () => mockGetSession(),
}));

const patchRaw = (rawBody: string) =>
  PATCH(
    new Request('http://localhost/api/users/user-456', {
      method: 'PATCH',
      body: rawBody,
    }) as unknown as Parameters<typeof PATCH>[0],
    { params: Promise.resolve({ userId: 'user-456' }) }
  );

const patchJson = (body: unknown) => patchRaw(JSON.stringify(body));

describe('PATCH /api/users/[userId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReportErrorEvent.mockResolvedValue(null);
    mockGetSession.mockResolvedValue({ user: { id: 'admin-123', roles: ['admin'] } });
    mockHasPermission.mockReturnValue(true);
  });

  describe('認証・権限チェック', () => {
    it('未認証の場合は 401 を返す', async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await patchJson({ name: '新しい名前' });

      expect(response.status).toBe(401);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('users:write 権限がない場合は 403 を返す', async () => {
      mockHasPermission.mockReturnValue(false);

      const response = await patchJson({ name: '新しい名前' });

      expect(response.status).toBe(403);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('roles:assign 権限がないのにロールを変更しようとした場合は 403 を返す', async () => {
      mockHasPermission.mockImplementation((_roles: string[], permission: string) => {
        return permission !== 'roles:assign';
      });

      const response = await patchJson({ roles: ['admin'] });

      expect(response.status).toBe(403);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });
  });

  describe('正常系', () => {
    it('名前とロールを更新できる', async () => {
      const updated = { userId: 'user-456', name: '新しい名前', roles: ['admin'] };
      mockUpdateUser.mockResolvedValue(updated);

      const response = await patchJson({ name: '新しい名前', roles: ['admin'] });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(updated);
      expect(mockUpdateUser).toHaveBeenCalledWith('user-456', {
        name: '新しい名前',
        roles: ['admin'],
      });
    });

    it('ユーザーが存在しない場合は 404 を返す', async () => {
      mockUpdateUser.mockRejectedValue(new UserNotFoundError('user-456'));

      const response = await patchJson({ name: '新しい名前' });

      expect(response.status).toBe(404);
      expect(mockReportErrorEvent).not.toHaveBeenCalled();
    });

    it('想定外のエラーは 500 を返し、通報する', async () => {
      mockUpdateUser.mockRejectedValue(new Error('DynamoDB error'));

      const response = await patchJson({ name: '新しい名前' });

      expect(response.status).toBe(500);
      expect(mockReportErrorEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe('不正なリクエストボディ', () => {
    it.each([
      ['壊れた JSON', '{"name": '],
      ['空のボディ', ''],
      ['null', 'null'],
      ['配列', '[{"name":"a"}]'],
      ['数値', '1'],
    ])('ボディが %s の場合は 400 を返し、リポジトリも通報も呼ばない', async (_label, rawBody) => {
      const response = await patchRaw(rawBody);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'リクエストボディが不正です',
        details: [{ field: '', message: USER_VALIDATION_ERROR_MESSAGES.BODY_NOT_OBJECT }],
      });
      expect(mockUpdateUser).not.toHaveBeenCalled();
      expect(mockReportErrorEvent).not.toHaveBeenCalled();
    });
  });

  describe('Zod の検証エラーメッセージ', () => {
    it.each([
      ['name が数値', { name: 1 }, 'name', USER_VALIDATION_ERROR_MESSAGES.NAME_NOT_STRING],
      ['name が null', { name: null }, 'name', USER_VALIDATION_ERROR_MESSAGES.NAME_NOT_STRING],
      ['name が空文字', { name: '' }, 'name', USER_VALIDATION_ERROR_MESSAGES.NAME_TOO_SHORT],
      [
        'name が 101 文字',
        { name: 'a'.repeat(101) },
        'name',
        USER_VALIDATION_ERROR_MESSAGES.NAME_TOO_LONG,
      ],
      [
        'roles が文字列',
        { roles: 'admin' },
        'roles',
        USER_VALIDATION_ERROR_MESSAGES.ROLES_NOT_ARRAY,
      ],
      ['roles が null', { roles: null }, 'roles', USER_VALIDATION_ERROR_MESSAGES.ROLES_NOT_ARRAY],
      [
        'roles の要素が数値',
        { roles: [1] },
        'roles.0',
        USER_VALIDATION_ERROR_MESSAGES.ROLE_INVALID,
      ],
      [
        'roles の要素が存在しないロール',
        { roles: ['no-such-role'] },
        'roles.0',
        USER_VALIDATION_ERROR_MESSAGES.ROLE_INVALID,
      ],
      ['定義外のキー', { unknown: 1 }, '', USER_VALIDATION_ERROR_MESSAGES.UNKNOWN_FIELD],
    ])('%s の場合は日本語の定数メッセージで 400 を返す', async (_label, body, field, message) => {
      const response = await patchJson(body);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'リクエストボディが不正です',
        details: [{ field, message }],
      });
      expect(mockUpdateUser).not.toHaveBeenCalled();
      expect(mockReportErrorEvent).not.toHaveBeenCalled();
    });

    it('複数の項目が誤っている場合も、すべてのメッセージが定数の日本語になる', async () => {
      const response = await patchJson({ name: 1, roles: 'admin', extra: true });

      expect(response.status).toBe(400);
      const data = (await response.json()) as { details: { message: string }[] };
      const allowed: string[] = Object.values(USER_VALIDATION_ERROR_MESSAGES);
      expect(data.details.length).toBeGreaterThanOrEqual(3);
      for (const detail of data.details) {
        expect(allowed).toContain(detail.message);
      }
    });
  });
});
