/**
 * Logger module
 *
 * Provides structured logging functionality with JSON output format.
 * Supports log levels (DEBUG, INFO, WARN, ERROR) and contextual information.
 */

// Export types
export type { LogLevel, LogContext, LogEntry, Logger } from './types.js';

// Export logger instance
export { logger } from './logger.js';
