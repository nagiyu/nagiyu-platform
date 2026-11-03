/**
 * Unit tests for POST /api/users/[userId]/roles endpoint
 *
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { EntityNotFoundError, OptimisticLockError } from '@nagiyu/aws';
import { POST } from '../../../../../src/app/api/users/[userId]/roles/route';
import { USER_VALIDATION_ERROR_MESSAGES } from '../../../../../src/app/api/users/schemas';

const mockGetSession = jest.fn();
const mockUpdateRolesAndGrants = jest.fn();
const mockHasPermission = jest.fn();
const mockReportErrorEvent = jest.fn().mockResolvedValue(null);

// jest.mock は import より前に巻き上げられるため、モック関数はファクトリ内で直接参照せず、呼び出し時に参照する
jest.mock('@nagiyu/auth-core', () => ({
  createUserRepository: jest.fn(() => ({
    updateRolesAndGrants: (...args: unknown[]) => mockUpdateRolesAndGrants(...args),
  })),
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

      const request = new NextRequest('http://localhost/api/users/user-123/roles', {
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

      const request = new NextRequest('http://localhost/api/users/user-456/roles', {
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
      const request = new NextRequest('http://localhost/api/users/user-456/roles', {
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
      mockUpdateRolesAndGrants.mockResolvedValue({
        userId: 'user-456',
        email: 'user@example.com',
        name: 'Test User',
        roles: ['admin', 'user-manager'],
        updatedAt: 1705320000000,
      });

      const request = new NextRequest('http://localhost/api/users/user-456/roles', {
        method: 'POST',
        body: JSON.stringify({ roles: ['admin', 'user-manager'] }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ userId: 'user-456' }),
      });

      expect(response.status).toBe(200);
      expect(mockUpdateRolesAndGrants).toHaveBeenCalledWith('user-456', expect.any(Function));
    });

    it('空の配列は許可される', async () => {
      mockUpdateRolesAndGrants.mockResolvedValue({
        userId: 'user-456',
        email: 'user@example.com',
        name: 'Test User',
        roles: [],
        updatedAt: 1705320000000,
      });

      const request = new NextRequest('http://localhost/api/users/user-456/roles', {
        method: 'POST',
        body: JSON.stringify({ roles: [] }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ userId: 'user-456' }),
      });

      expect(response.status).toBe(200);
      expect(mockUpdateRolesAndGrants).toHaveBeenCalledWith('user-456', expect.any(Function));
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
      mockUpdateRolesAndGrants.mockRejectedValue(new EntityNotFoundError('User', 'user-999'));

      const request = new NextRequest('http://localhost/api/users/user-999/roles', {
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

    it('競合がやり直しで解けない場合は 409 を返す', async () => {
      mockUpdateRolesAndGrants.mockRejectedValue(new OptimisticLockError('User', 'user-456'));

      const request = new NextRequest('http://localhost/api/users/user-456/roles', {
        method: 'POST',
        body: JSON.stringify({ roles: ['admin'] }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ userId: 'user-456' }),
      });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toBe('他の更新と競合しました。再読み込みしてください');
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
        updatedAt: 1705320000000,
      };

      mockUpdateRolesAndGrants.mockResolvedValue(mockUpdatedUser);

      const request = new NextRequest('http://localhost/api/users/user-456/roles', {
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
      const request = new NextRequest('http://localhost/api/users/user-456/roles', {
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
      const request = new NextRequest('http://localhost/api/users/user-456/roles', {
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
        new NextRequest('http://localhost/api/users/user-456/roles', {
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
      expect(mockUpdateRolesAndGrants).not.toHaveBeenCalled();
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
      expect(mockUpdateRolesAndGrants).not.toHaveBeenCalled();
      expect(mockReportErrorEvent).not.toHaveBeenCalled();
    });
  });

  describe('課金の権利の変更 (grantChanges)', () => {
    const NOW = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const manualGrant = {
      grantId: 'manual-1',
      roleId: 'admin',
      source: 'manual' as const,
      expiresAt: NOW + DAY,
      createdAt: NOW - DAY,
      updatedAt: NOW - DAY,
    };
    const stripeGrant = { ...manualGrant, grantId: 'stripe-1', source: 'stripe' as const };
    const revokedGrant = { ...manualGrant, grantId: 'revoked-1', revokedAt: NOW - 1000 };
    const baseUser = {
      userId: 'user-456',
      googleId: 'g',
      email: 'u@example.com',
      name: 'U',
      roles: ['user-manager'],
      roleGrants: [manualGrant, stripeGrant, revokedGrant],
      createdAt: NOW - DAY,
      updatedAt: NOW - DAY,
    };

    beforeEach(() => {
      mockGetSession.mockResolvedValue({ user: { id: 'admin-123', roles: ['admin'] } });
      mockHasPermission.mockReturnValue(true);
      // リポジトリと同じく、読んだユーザーに compute の結果を適用して返す
      mockUpdateRolesAndGrants.mockImplementation(
        async (_userId: string, compute: (user: typeof baseUser) => object) => ({
          ...baseUser,
          ...compute(baseUser),
        })
      );
    });

    const post = (body: unknown) =>
      POST(
        new NextRequest('http://localhost/api/users/user-456/roles', {
          method: 'POST',
          body: JSON.stringify(body),
        }) as unknown as Parameters<typeof POST>[0],
        { params: Promise.resolve({ userId: 'user-456' }) }
      );

    it('grantChanges がなければ権利は変えず、手動ロールだけ書き換える', async () => {
      const response = await post({ roles: ['admin'] });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.roles).toEqual(['admin']);
      expect(data.roleGrants).toEqual([manualGrant, stripeGrant, revokedGrant]);
    });

    it('追加・延長・取り消しを手動ロールと一緒に 1 回の書き込みで反映する', async () => {
      const newExpiresAt = NOW + 10 * DAY;
      const response = await post({
        roles: ['admin'],
        grantChanges: {
          add: [{ roleId: 'user-manager', expiresAt: newExpiresAt, sourceRef: '検証用' }],
          extend: [{ grantId: 'manual-1', expiresAt: newExpiresAt }],
        },
      });

      expect(response.status).toBe(200);
      expect(mockUpdateRolesAndGrants).toHaveBeenCalledTimes(1);
      const data = await response.json();
      expect(data.roles).toEqual(['admin']);
      expect(data.roleGrants).toHaveLength(4);
      expect(data.roleGrants[0]).toMatchObject({ grantId: 'manual-1', expiresAt: newExpiresAt });
      expect(data.roleGrants[3]).toMatchObject({
        roleId: 'user-manager',
        source: 'manual',
        sourceRef: '検証用',
        expiresAt: newExpiresAt,
        grantedBy: 'admin-123',
      });
      expect(data.roleGrants[3].grantId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('手動の権利を取り消すと revokedAt が付き、権利は残る', async () => {
      const response = await post({ roles: [], grantChanges: { revoke: ['manual-1'] } });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.roleGrants[0].revokedAt).toEqual(expect.any(Number));
      expect(data.roleGrants).toHaveLength(3);
    });

    it.each([
      ['add の roleId が無効', { add: [{ roleId: 'nope', expiresAt: NOW + DAY }] }, '無効なロール'],
      [
        'add の expiresAt が過去',
        { add: [{ roleId: 'admin', expiresAt: NOW - DAY }] },
        '現在より後',
      ],
      [
        'extend の expiresAt が過去',
        { extend: [{ grantId: 'manual-1', expiresAt: NOW - DAY }] },
        '現在より後',
      ],
      [
        'extend の対象が存在しない',
        { extend: [{ grantId: 'none', expiresAt: NOW + DAY }] },
        '見つかりません',
      ],
      ['revoke の対象が存在しない', { revoke: ['none'] }, '見つかりません'],
      [
        'extend の対象が Stripe 由来',
        { extend: [{ grantId: 'stripe-1', expiresAt: NOW + DAY }] },
        '手動で付けた権利以外',
      ],
      ['revoke の対象が Stripe 由来', { revoke: ['stripe-1'] }, '手動で付けた権利以外'],
      ['revoke の対象が取り消し済み', { revoke: ['revoked-1'] }, '取り消し済み'],
      [
        'extend の対象が取り消し済み',
        { extend: [{ grantId: 'revoked-1', expiresAt: NOW + DAY }] },
        '取り消し済み',
      ],
      [
        '同じ権利を延長と取り消しで指定',
        { extend: [{ grantId: 'manual-1', expiresAt: NOW + DAY }], revoke: ['manual-1'] },
        '重複',
      ],
    ])('%s の場合は 400 を返す', async (_label, grantChanges, message) => {
      const response = await post({ roles: ['admin'], grantChanges });

      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain(message);
      expect(mockReportErrorEvent).not.toHaveBeenCalled();
    });

    it.each([
      ['grantChanges が配列', { grantChanges: [] }, 'grantChanges'],
      ['add が配列でない', { grantChanges: { add: 'x' } }, 'grantChanges.add'],
      [
        'add の expiresAt が文字列',
        { grantChanges: { add: [{ roleId: 'admin', expiresAt: 'x' }] } },
        'grantChanges.add.0.expiresAt',
      ],
      [
        'add の roleId がない',
        { grantChanges: { add: [{ expiresAt: 1 }] } },
        'grantChanges.add.0.roleId',
      ],
      [
        'add の sourceRef が長すぎる',
        { grantChanges: { add: [{ roleId: 'admin', expiresAt: 1, sourceRef: 'x'.repeat(201) }] } },
        'grantChanges.add.0.sourceRef',
      ],
      [
        'extend の grantId がない',
        { grantChanges: { extend: [{ expiresAt: 1 }] } },
        'grantChanges.extend.0.grantId',
      ],
      ['revoke の要素が数値', { grantChanges: { revoke: [1] } }, 'grantChanges.revoke.0'],
    ])('%s の場合は形式エラーで 400 を返す', async (_label, extra, field) => {
      const response = await post({ roles: [], ...extra });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('リクエストボディが不正です');
      expect(data.details[0].field).toBe(field);
      expect(mockUpdateRolesAndGrants).not.toHaveBeenCalled();
    });

    it('権利の変更でもユーザー不存在は 404 を返す', async () => {
      mockUpdateRolesAndGrants.mockRejectedValue(new EntityNotFoundError('User', 'user-456'));

      const response = await post({ roles: [], grantChanges: { revoke: ['manual-1'] } });

      expect(response.status).toBe(404);
    });
  });
});
