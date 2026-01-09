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
 */
export type Permission = string;

/**
 * Valid role IDs defined in ROLES constant
 */
export type Role = keyof typeof ROLES;
