/**
 * @nagiyu/nextjs
 *
 * Next.js-specific API Route helpers for Nagiyu Platform.
 * Provides authentication, repository initialization, pagination, and error handling utilities.
 */

// Auth module - Authentication and Authorization helpers
export { getAuthError, getSessionOrThrow, getOptionalSession, withAuth } from './auth.js';
export type { AuthError, AuthFunction } from './auth.js';
export {
  createAuthConfig,
  createServiceAuthConfig,
  createAuthSessionConfig,
  createAuthCookieOptions,
  createAuthCookies,
  createAuthCallbacks,
} from './auth-config.js';
export type {
  CreateAuthConfigOptions,
  CreateAuthCallbacksOptions,
  CreateServiceAuthConfigOptions,
} from './auth-config.js';
export { createAuthMiddleware } from './middleware.js';
export type { AuthMiddlewareRequest, CreateAuthMiddlewareOptions } from './middleware.js';
export { createSessionGetter } from './session.js';
export type { CreateSessionGetterOptions } from './session.js';

// Repository module - Repository initialization helpers
export { withRepository, withRepositories } from './repository.js';
export type { RepositoryConstructor, GetDynamoDBClient, GetTableName } from './repository.js';

// Pagination module - Pagination helpers
export {
  parsePagination,
  createPaginatedResponse,
  PAGINATION_ERROR_CODES,
  PAGINATION_ERROR_MESSAGES,
  PaginationValidationError,
} from './pagination.js';
export type { PaginationParams, PaginationErrorCode } from './pagination.js';

// Error module - Error handling helpers
export { handleApiError } from './error.js';

// Health module - Health check route helper
export { createHealthRoute } from './health.js';
export type { HealthRouteOptions } from './health.js';

// Push module - Web Push route helper
export {
  createVapidPublicKeyRoute,
  validatePushSubscription,
  createSubscriptionId,
} from './push.js';
export type { PushSubscriptionData } from './push.js';
