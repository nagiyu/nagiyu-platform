/**
 * @nagiyu/nextjs
 *
 * Next.js-specific API Route helpers for Nagiyu Platform.
 * Provides authentication, repository initialization, pagination, and error handling utilities.
 */

// Auth module - Authentication and Authorization helpers
export { getAuthError, getSessionOrThrow, getOptionalSession, withAuth } from './auth.js';
export type { AuthError, AuthFunction } from './auth.js';

// Repository module - Repository initialization helpers
export { withRepository, withRepositories } from './repository.js';
export type { RepositoryConstructor, GetDynamoDBClient, GetTableName } from './repository.js';

// Pagination module - Pagination helpers
export { parsePagination, createPaginatedResponse } from './pagination.js';
export type { PaginationParams } from './pagination.js';

// Error module - Error handling helpers
export { handleApiError } from './error.js';
