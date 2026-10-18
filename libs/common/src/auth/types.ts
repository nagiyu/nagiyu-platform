/**
 * Authentication and Authorization Type Definitions
 *
 * Provides common types for user authentication and role-based access control (RBAC)
 * across the nagiyu platform.
 */

import type { ROLES } from './roles.js';

/**
 * DynamoDB に保存されるユーザー情報
 *
 * セッション上のユーザー ({@link SessionUser}) とは別物で、JWT からは復元できない値を含む。
 */
export interface User {
  /** Platform-wide unique user ID (UUID v4) */
  userId: string;
  /** Google OAuth ID (sub claim) */
  googleId: string;
  /** User's email address */
  email: string;
  /** Display name */
  name: string;
  /** Array of role IDs assigned to the user */
  roles: string[];
  /** Unix timestamp (milliseconds) of user creation */
  createdAt: number;
  /** Unix timestamp (milliseconds) of last update */
  updatedAt: number;
  /** Unix timestamp (milliseconds) of last login (optional) */
  lastLoginAt?: number;
  /** Profile picture URL (optional, from OAuth provider) */
  picture?: string;
}

/**
 * セッションのユーザー
 *
 * JWT から復元される、リクエスト時点の認証済みユーザー。DB 上のユーザー ({@link User}) とは
 * 別物で、googleId や作成日時など JWT に載らない値は持たない。
 * next-auth の `Session['user']` の型拡張もこの型を参照する。
 */
export interface SessionUser {
  /** プラットフォーム共通のユーザー ID (UUID v4) */
  id: string;
  /** メールアドレス */
  email: string;
  /** 表示名 */
  name: string;
  /** プロフィール画像の URL (OAuth プロバイダー由来、任意) */
  image?: string;
  /** ユーザーに割り当てられたロール ID の一覧 */
  roles: string[];
}

/**
 * セッション
 *
 * サーバー側の getSession と next-auth の `Session` が共通で持つ形。
 */
export interface Session {
  /** 認証済みユーザー */
  user: SessionUser;
  /** セッションの有効期限 (ISO 8601) */
  expires: string;
}

/**
 * Permission string in the format: {resource}:{action}
 * Examples: 'users:read', 'users:write', 'roles:assign'
 *
 * Stock Tracker permissions:
 * - stocks:read - View charts, exchanges, and tickers
 * - stocks:write-own - Manage own alerts and holdings
 * - stocks:manage-data - Manage master data (exchanges and tickers)
 *
 * Auth Service permissions:
 * - auth:read - View auth configuration and user data
 * - auth:write - Manage auth configuration and user data
 *
 * LiveTalk permissions:
 * - livetalk:chat - Access LiveTalk chat UI and API
 * - livetalk:admin - Access LiveTalk admin features (status page, debug panel)
 */
export type Permission =
  | 'users:read'
  | 'users:write'
  | 'roles:assign'
  | 'notifications:write'
  | 'errors:read'
  | 'stocks:read'
  | 'stocks:write-own'
  | 'stocks:manage-data'
  | 'auth:read'
  | 'auth:write'
  | 'livetalk:chat'
  | 'livetalk:admin';

/**
 * Valid role IDs defined in ROLES constant
 */
export type Role = keyof typeof ROLES;
