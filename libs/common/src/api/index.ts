/**
 * API module
 *
 * Provides common API-related utilities and types for HTTP communication.
 * This module is framework-agnostic and can be used across all services.
 */

// Export types
export type {
  RetryConfig,
  APIRequestOptions,
  ErrorType,
  ErrorInfo,
  APIErrorResponse,
} from './types';
export { APIError, COMMON_ERROR_MESSAGES } from './types';

// Export error handling utilities
export {
  getErrorTypeFromStatus,
  parseErrorResponse,
  handleFetchError,
  mapAPIErrorToMessage,
  isRetryableError,
  extractErrorInfo,
} from './error-handler';

// Export API client
export {
  calculateBackoffDelay,
  sleep,
  fetchWithTimeout,
  apiRequest,
  get,
  post,
  put,
  del,
} from './client';
