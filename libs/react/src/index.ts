/**
 * @nagiyu/react
 *
 * React-specific utility library for Nagiyu Platform.
 * This package provides React hooks, components, and utilities that can be used
 * across all React-based services.
 */

// Export React hooks
export { useAPIRequest } from './hooks';
export type { UseAPIRequestOptions, UseAPIRequestReturn } from './hooks';

// Export API Client
export { ApiClient, APIError } from './api-client';
export type { APIRequestOptions, RetryConfig, ErrorInfo } from './api-client';
