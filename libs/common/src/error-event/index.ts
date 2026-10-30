/**
 * ErrorEvent モジュール
 *
 * プラットフォーム共通のエラーイベント型と関連ヘルパーを提供する。
 */

export type { ErrorEvent, ErrorSeverity, ErrorSource } from './types.js';
export { ERROR_SEVERITIES, ERROR_SOURCES, isErrorSeverity, isErrorSource } from './types.js';
export { generateEventId } from './event-id.js';
export type { ErrorContext } from './error-context.js';
export { buildErrorContext } from './error-context.js';
