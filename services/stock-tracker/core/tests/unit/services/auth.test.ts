/**
 * Authentication Service Unit Tests
 *
 * core/services/auth.ts の全関数をテスト
 * - getAuthError: 認証エラー生成ロジック
 */

import { getAuthError, AUTH_ERROR_MESSAGES } from '../../../src/services/auth.js';
import type { Session } from '@nagiyu/common';

describe('Authentication Service', () => {
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
