/**
 * NextAuth.js Session Management
 *
 * Auth サービスから発行された JWT を検証し、セッション情報を返す。
 * Admin サービスと同じ実装パターンを使用。
 */

import { auth } from '../auth';
import type { Session } from '@nagiyu/common';

/**
 * セッション情報を取得する
 *
 * Auth サービスから発行された JWT を検証し、セッション情報を返す。
 *
 * テスト環境で SKIP_AUTH_CHECK=true の場合、モックセッションを返します。
 *
 * @returns セッション情報、未認証の場合は null
 */
export async function getSession(): Promise<Session | null> {
  // テスト環境で認証をスキップする場合、モックセッションを返す
  if (process.env.SKIP_AUTH_CHECK === 'true') {
    return {
      user: {
        userId: process.env.TEST_USER_ID || 'test-user-id',
        googleId: 'test-google-id',
        email: process.env.TEST_USER_EMAIL || 'test@example.com',
        name: process.env.TEST_USER_NAME || 'Test User',
        roles: process.env.TEST_USER_ROLES?.split(',') || ['stock-user'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  const session = await auth();

  if (!session?.user) {
    return null;
  }

  // NextAuth session を @nagiyu/common Session 形式に変換
  return {
    user: {
      userId: session.user.id || '',
      googleId: '', // NextAuth の token から取得する場合は実装が必要
      email: session.user.email || '',
      name: session.user.name || '',
      roles: session.user.roles || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    expires: session.expires || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
