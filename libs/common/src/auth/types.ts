/**
 * Authentication and Authorization Type Definitions
 *
 * Provides common types for user authentication and role-based access control (RBAC)
 * across the nagiyu platform.
 */

import type { ROLES } from './roles.js';

/**
 * User information stored in DynamoDB and included in JWT
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
  /** ISO 8601 timestamp of user creation */
  createdAt: string;
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
  /** ISO 8601 timestamp of last login (optional) */
  lastLoginAt?: string;
}

/**
 * Session information returned by NextAuth.js
 */
export interface Session {
  /** Authenticated user information */
  user: User;
  /** ISO 8601 timestamp when the session expires */
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
 */
export type Permission =
  | 'users:read'
  | 'users:write'
  | 'roles:assign'
  | 'stocks:read'
  | 'stocks:write-own'
  | 'stocks:manage-data'
  | 'auth:read'
  | 'auth:write';

/**
 * Valid role IDs defined in ROLES constant
 */
export type Role = keyof typeof ROLES;
