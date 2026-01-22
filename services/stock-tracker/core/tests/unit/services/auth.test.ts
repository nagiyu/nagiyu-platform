/**
 * Authentication Service Unit Tests
 *
 * core/services/auth.ts の全関数をテスト
 * - checkPermission: 権限チェックロジック
 * - getAuthError: 認証エラー生成ロジック
 */

import { checkPermission, getAuthError, AUTH_ERROR_MESSAGES } from '../../../src/services/auth.js';
import type { Session } from '@nagiyu/common';

describe('Authentication Service', () => {
  describe('checkPermission', () => {
    it('ユーザーが必要な権限を持っている場合、trueを返す', () => {
      const session: Session = {
        user: {
          userId: 'test-user-id',
          googleId: 'test-google-id',
          email: 'test@example.com',
          name: 'Test User',
          roles: ['stock-user'], // stock-user は stocks:read 権限を持つ
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        expires: '2026-12-31T23:59:59.999Z',
      };

      const result = checkPermission(session, 'stocks:read');

      expect(result).toBe(true);
    });

    it('ユーザーが必要な権限を持っていない場合、falseを返す', () => {
      const session: Session = {
        user: {
          userId: 'test-user-id',
          googleId: 'test-google-id',
          email: 'test@example.com',
          name: 'Test User',
          roles: ['guest'], // guest は stocks:read 権限を持たない
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        expires: '2026-12-31T23:59:59.999Z',
      };

      const result = checkPermission(session, 'stocks:read');

      expect(result).toBe(false);
    });

    it('管理者権限を持つユーザーは全ての権限を持つ', () => {
      const session: Session = {
        user: {
          userId: 'admin-user-id',
          googleId: 'admin-google-id',
          email: 'admin@example.com',
          name: 'Admin User',
          roles: ['stock-admin'], // stock-admin は全ての権限を持つ
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        expires: '2026-12-31T23:59:59.999Z',
      };

      // 複数の権限をテスト
      expect(checkPermission(session, 'stocks:read')).toBe(true);
      expect(checkPermission(session, 'stocks:write-own')).toBe(true);
      expect(checkPermission(session, 'stocks:manage-data')).toBe(true);
    });

    it('複数のロールを持つユーザーの権限チェック', () => {
      const session: Session = {
        user: {
          userId: 'multi-role-user-id',
          googleId: 'multi-google-id',
          email: 'multi@example.com',
          name: 'Multi Role User',
          roles: ['stock-user', 'guest'], // 複数ロール
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        expires: '2026-12-31T23:59:59.999Z',
      };

      // stock-user が持つ権限
      expect(checkPermission(session, 'stocks:read')).toBe(true);
      expect(checkPermission(session, 'stocks:write-own')).toBe(true);

      // stock-admin のみが持つ権限
      expect(checkPermission(session, 'stocks:manage-data')).toBe(false);
    });
  });

  describe('getAuthError', () => {
    it('セッションがnullの場合、401エラーを返す', () => {
      const result = getAuthError(null, 'stocks:read');

      expect(result).not.toBeNull();
      expect(result?.statusCode).toBe(401);
      expect(result?.message).toBe(AUTH_ERROR_MESSAGES.UNAUTHORIZED);
    });

    it('権限が不足している場合、403エラーを返す', () => {
      const session: Session = {
        user: {
          userId: 'test-user-id',
          googleId: 'test-google-id',
          email: 'test@example.com',
          name: 'Test User',
          roles: ['guest'], // stocks:read 権限なし
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        expires: '2026-12-31T23:59:59.999Z',
      };

      const result = getAuthError(session, 'stocks:read');

      expect(result).not.toBeNull();
      expect(result?.statusCode).toBe(403);
      expect(result?.message).toBe(AUTH_ERROR_MESSAGES.FORBIDDEN);
    });

    it('認証済みかつ権限がある場合、nullを返す', () => {
      const session: Session = {
        user: {
          userId: 'test-user-id',
          googleId: 'test-google-id',
          email: 'test@example.com',
          name: 'Test User',
          roles: ['stock-user'], // stocks:read 権限あり
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        expires: '2026-12-31T23:59:59.999Z',
      };

      const result = getAuthError(session, 'stocks:read');

      expect(result).toBeNull();
    });

    it('管理者は全ての権限に対してnullを返す', () => {
      const session: Session = {
        user: {
          userId: 'admin-user-id',
          googleId: 'admin-google-id',
          email: 'admin@example.com',
          name: 'Admin User',
          roles: ['stock-admin'], // 全権限
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        expires: '2026-12-31T23:59:59.999Z',
      };

      // 複数の権限に対してテスト
      expect(getAuthError(session, 'stocks:read')).toBeNull();
      expect(getAuthError(session, 'stocks:write-own')).toBeNull();
      expect(getAuthError(session, 'stocks:manage-data')).toBeNull();
    });

    it('エラーメッセージが日本語であることを確認', () => {
      // 未認証エラー
      const unauthorizedError = getAuthError(null, 'stocks:read');
      expect(unauthorizedError?.message).toMatch(/認証が必要/);

      // 権限不足エラー
      const session: Session = {
        user: {
          userId: 'test-user-id',
          googleId: 'test-google-id',
          email: 'test@example.com',
          name: 'Test User',
          roles: ['guest'],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        expires: '2026-12-31T23:59:59.999Z',
      };
      const forbiddenError = getAuthError(session, 'stocks:read');
      expect(forbiddenError?.message).toMatch(/権限がありません/);
    });
  });
});
