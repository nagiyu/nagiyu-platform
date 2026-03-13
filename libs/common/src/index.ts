/**
 * @nagiyu/common
 *
 * Framework-agnostic common utility library for Nagiyu Platform.
 * This package provides shared utilities and type definitions that can be used
 * across all services without any framework dependencies.
 */

// Auth module - Authentication and Authorization utilities
export * from './auth/index.js';

// Validation module - Common validation utilities
export * from './validation/index.js';
// Logger module - Structured logging functionality
export * from './logger/index.js';

// API module - Common API utilities and types
export * from './api/index.js';

// Retry module - Backend retry utilities
export * from './retry/index.js';

// Constants module - Common constants
export { ERROR_CODES } from './constants/error-codes.js';
export type { ErrorCode } from './constants/error-codes.js';
export { COMMON_ERROR_MESSAGES } from './constants/error-messages.js';
export type { CommonErrorMessageKey } from './constants/error-messages.js';
export { HTTP_STATUS } from './constants/http-status.js';
