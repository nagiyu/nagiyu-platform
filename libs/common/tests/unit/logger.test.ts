/**
 * Unit tests for logging functionality
 */

import type { LogEntry, LogContext } from '../../src/logger/types';

// Mock console methods before importing logger
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

// Store original env
const originalEnv = process.env;

describe('Logger', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();

    // Reset modules to get fresh logger instance
    jest.resetModules();

    // Reset environment
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original env
    process.env = originalEnv;

    // Restore console methods
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('Log Level Filtering', () => {
    it('should output all levels when LOG_LEVEL=DEBUG', async () => {
      process.env.LOG_LEVEL = 'DEBUG';
      const { logger } = await import('../../src/logger/logger');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(2); // debug, info
      expect(mockConsoleError).toHaveBeenCalledTimes(2); // warn, error
    });

    it('should output INFO, WARN, ERROR when LOG_LEVEL=INFO (default)', async () => {
      process.env.LOG_LEVEL = 'INFO';
      const { logger } = await import('../../src/logger/logger');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1); // info only
      expect(mockConsoleError).toHaveBeenCalledTimes(2); // warn, error
    });

    it('should output WARN, ERROR when LOG_LEVEL=WARN', async () => {
      process.env.LOG_LEVEL = 'WARN';
      const { logger } = await import('../../src/logger/logger');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(0);
      expect(mockConsoleError).toHaveBeenCalledTimes(2); // warn, error
    });

    it('should output ERROR only when LOG_LEVEL=ERROR', async () => {
      process.env.LOG_LEVEL = 'ERROR';
      const { logger } = await import('../../src/logger/logger');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(0);
      expect(mockConsoleError).toHaveBeenCalledTimes(1); // error only
    });

    it('should use default INFO level when LOG_LEVEL is not set', async () => {
      delete process.env.LOG_LEVEL;
      const { logger } = await import('../../src/logger/logger');

      logger.debug('debug message');
      logger.info('info message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1); // info only
    });

    it('should use default INFO level when LOG_LEVEL is invalid', async () => {
      process.env.LOG_LEVEL = 'INVALID';
      const { logger } = await import('../../src/logger/logger');

      // Should output warning about invalid level
      expect(mockConsoleError).toHaveBeenCalledTimes(1);
      const warningCall = mockConsoleError.mock.calls[0][0];
      const warningLog = JSON.parse(warningCall);
      expect(warningLog.level).toBe('WARN');
      expect(warningLog.message).toContain('Invalid LOG_LEVEL');

      mockConsoleError.mockClear();

      logger.debug('debug message');
      logger.info('info message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1); // info only (default)
    });
  });

  describe('Log Output Format', () => {
    beforeEach(() => {
      process.env.LOG_LEVEL = 'DEBUG';
    });

    it('should output valid JSON format', async () => {
      const { logger } = await import('../../src/logger/logger');

      logger.info('test message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const logOutput = mockConsoleLog.mock.calls[0][0];

      // Should be valid JSON
      expect(() => JSON.parse(logOutput)).not.toThrow();
    });

    it('should include timestamp in ISO 8601 format', async () => {
      const { logger } = await import('../../src/logger/logger');

      logger.info('test message');

      const logOutput = mockConsoleLog.mock.calls[0][0];
      const logEntry: LogEntry = JSON.parse(logOutput);

      expect(logEntry.timestamp).toBeDefined();
      // Check if it's a valid ISO 8601 timestamp
      expect(new Date(logEntry.timestamp).toISOString()).toBe(logEntry.timestamp);
    });

    it('should include correct log level', async () => {
      const { logger } = await import('../../src/logger/logger');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      const debugLog: LogEntry = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      const infoLog: LogEntry = JSON.parse(mockConsoleLog.mock.calls[1][0]);
      const warnLog: LogEntry = JSON.parse(mockConsoleError.mock.calls[0][0]);
      const errorLog: LogEntry = JSON.parse(mockConsoleError.mock.calls[1][0]);

      expect(debugLog.level).toBe('DEBUG');
      expect(infoLog.level).toBe('INFO');
      expect(warnLog.level).toBe('WARN');
      expect(errorLog.level).toBe('ERROR');
    });

    it('should include message', async () => {
      const { logger } = await import('../../src/logger/logger');

      logger.info('test message');

      const logOutput = mockConsoleLog.mock.calls[0][0];
      const logEntry: LogEntry = JSON.parse(logOutput);

      expect(logEntry.message).toBe('test message');
    });

    it('should not include context field when no context is provided', async () => {
      const { logger } = await import('../../src/logger/logger');

      logger.info('test message');

      const logOutput = mockConsoleLog.mock.calls[0][0];
      const logEntry: LogEntry = JSON.parse(logOutput);

      expect(logEntry.context).toBeUndefined();
    });

    it('should include context field when context is provided', async () => {
      const { logger } = await import('../../src/logger/logger');

      const context: LogContext = {
        userId: 'user123',
        requestId: 'req-456',
      };

      logger.info('test message', context);

      const logOutput = mockConsoleLog.mock.calls[0][0];
      const logEntry: LogEntry = JSON.parse(logOutput);

      expect(logEntry.context).toEqual(context);
    });
  });

  describe('Context Information', () => {
    beforeEach(() => {
      process.env.LOG_LEVEL = 'DEBUG';
    });

    it('should handle string values in context', async () => {
      const { logger } = await import('../../src/logger/logger');

      logger.info('test message', { key: 'value' });

      const logOutput = mockConsoleLog.mock.calls[0][0];
      const logEntry: LogEntry = JSON.parse(logOutput);

      expect(logEntry.context).toEqual({ key: 'value' });
    });

    it('should handle number values in context', async () => {
      const { logger } = await import('../../src/logger/logger');

      logger.info('test message', { count: 42 });

      const logOutput = mockConsoleLog.mock.calls[0][0];
      const logEntry: LogEntry = JSON.parse(logOutput);

      expect(logEntry.context).toEqual({ count: 42 });
    });

    it('should handle boolean values in context', async () => {
      const { logger } = await import('../../src/logger/logger');

      logger.info('test message', { success: true });

      const logOutput = mockConsoleLog.mock.calls[0][0];
      const logEntry: LogEntry = JSON.parse(logOutput);

      expect(logEntry.context).toEqual({ success: true });
    });

    it('should handle nested objects in context', async () => {
      const { logger } = await import('../../src/logger/logger');

      const context = {
        user: {
          id: 'user123',
          name: 'Test User',
        },
        metadata: {
          timestamp: Date.now(),
        },
      };

      logger.info('test message', context);

      const logOutput = mockConsoleLog.mock.calls[0][0];
      const logEntry: LogEntry = JSON.parse(logOutput);

      expect(logEntry.context).toEqual(context);
    });

    it('should handle null values in context', async () => {
      const { logger } = await import('../../src/logger/logger');

      logger.info('test message', { value: null });

      const logOutput = mockConsoleLog.mock.calls[0][0];
      const logEntry: LogEntry = JSON.parse(logOutput);

      expect(logEntry.context).toEqual({ value: null });
    });

    it('should handle undefined values in context', async () => {
      const { logger } = await import('../../src/logger/logger');

      logger.info('test message', { value: undefined });

      const logOutput = mockConsoleLog.mock.calls[0][0];
      const logEntry: LogEntry = JSON.parse(logOutput);

      // undefined values are omitted in JSON
      expect(logEntry.context).toEqual({});
    });

    it('should handle arrays in context', async () => {
      const { logger } = await import('../../src/logger/logger');

      logger.info('test message', { items: [1, 2, 3] });

      const logOutput = mockConsoleLog.mock.calls[0][0];
      const logEntry: LogEntry = JSON.parse(logOutput);

      expect(logEntry.context).toEqual({ items: [1, 2, 3] });
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      process.env.LOG_LEVEL = 'DEBUG';
    });

    it('should handle Error object in context', async () => {
      const { logger } = await import('../../src/logger/logger');

      const error = new Error('Test error');
      logger.error('Operation failed', {
        error: error.message,
        stack: error.stack,
      });

      const logOutput = mockConsoleError.mock.calls[0][0];
      const logEntry: LogEntry = JSON.parse(logOutput);

      expect(logEntry.context?.error).toBe('Test error');
      expect(logEntry.context?.stack).toBeDefined();
    });

    it('should handle circular references gracefully', async () => {
      const { logger } = await import('../../src/logger/logger');

      // Create circular reference
      const circular: { self?: unknown } = {};
      circular.self = circular;

      logger.info('test message', circular);

      // Should output error message about stringify failure
      expect(mockConsoleError).toHaveBeenCalled();
      const errorLog = mockConsoleError.mock.calls[0][0];
      const errorEntry: LogEntry = JSON.parse(errorLog);

      expect(errorEntry.level).toBe('ERROR');
      expect(errorEntry.message).toBe('Failed to stringify log entry');
    });
  });

  describe('Output Destination', () => {
    beforeEach(() => {
      process.env.LOG_LEVEL = 'DEBUG';
    });

    it('should output DEBUG to stdout', async () => {
      const { logger } = await import('../../src/logger/logger');

      logger.debug('debug message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      expect(mockConsoleError).toHaveBeenCalledTimes(0);
    });

    it('should output INFO to stdout', async () => {
      const { logger } = await import('../../src/logger/logger');

      logger.info('info message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      expect(mockConsoleError).toHaveBeenCalledTimes(0);
    });

    it('should output WARN to stderr', async () => {
      const { logger } = await import('../../src/logger/logger');

      logger.warn('warn message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(0);
      expect(mockConsoleError).toHaveBeenCalledTimes(1);
    });

    it('should output ERROR to stderr', async () => {
      const { logger } = await import('../../src/logger/logger');

      logger.error('error message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(0);
      expect(mockConsoleError).toHaveBeenCalledTimes(1);
    });
  });

  describe('JSON Schema Validation', () => {
    beforeEach(() => {
      process.env.LOG_LEVEL = 'DEBUG';
    });

    it('should have required fields: timestamp, level, message', async () => {
      const { logger } = await import('../../src/logger/logger');

      logger.info('test message');

      const logOutput = mockConsoleLog.mock.calls[0][0];
      const logEntry: LogEntry = JSON.parse(logOutput);

      expect(logEntry).toHaveProperty('timestamp');
      expect(logEntry).toHaveProperty('level');
      expect(logEntry).toHaveProperty('message');
    });

    it('should have valid level enum value', async () => {
      const { logger } = await import('../../src/logger/logger');

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      const debugLog: LogEntry = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      const infoLog: LogEntry = JSON.parse(mockConsoleLog.mock.calls[1][0]);
      const warnLog: LogEntry = JSON.parse(mockConsoleError.mock.calls[0][0]);
      const errorLog: LogEntry = JSON.parse(mockConsoleError.mock.calls[1][0]);

      const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
      expect(validLevels).toContain(debugLog.level);
      expect(validLevels).toContain(infoLog.level);
      expect(validLevels).toContain(warnLog.level);
      expect(validLevels).toContain(errorLog.level);
    });

    it('should have context as object when present', async () => {
      const { logger } = await import('../../src/logger/logger');

      logger.info('test message', { key: 'value' });

      const logOutput = mockConsoleLog.mock.calls[0][0];
      const logEntry: LogEntry = JSON.parse(logOutput);

      expect(typeof logEntry.context).toBe('object');
      expect(logEntry.context).not.toBeNull();
    });
  });
});
