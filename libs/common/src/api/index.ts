/**
 * API module
 *
 * This module provides API-related utilities and types for the Nagiyu Platform.
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
