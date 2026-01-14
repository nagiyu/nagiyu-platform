/**
 * Logger ユーティリティのテスト
 */

import { Logger, logger } from '../../../src/lib/logger.js';

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('info', () => {
    it('INFOレベルのログを出力できる', () => {
      const testLogger = new Logger();
      testLogger.info('テストメッセージ');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe('INFO');
      expect(logEntry.message).toBe('テストメッセージ');
      expect(logEntry.timestamp).toBeDefined();
    });

    it('コンテキスト情報を含めてログを出力できる', () => {
      const testLogger = new Logger();
      const context = { userId: '123', action: 'test' };
      testLogger.info('テストメッセージ', context);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe('INFO');
      expect(logEntry.message).toBe('テストメッセージ');
      expect(logEntry.context).toEqual(context);
    });
  });

  describe('warn', () => {
    it('WARNレベルのログを出力できる', () => {
      const testLogger = new Logger();
      testLogger.warn('警告メッセージ');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe('WARN');
      expect(logEntry.message).toBe('警告メッセージ');
    });
  });

  describe('error', () => {
    it('ERRORレベルのログを出力できる', () => {
      const testLogger = new Logger();
      testLogger.error('エラーメッセージ');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe('ERROR');
      expect(logEntry.message).toBe('エラーメッセージ');
    });
  });

  describe('debug', () => {
    it('DEBUGレベルのログを出力できる', () => {
      const testLogger = new Logger();
      testLogger.debug('デバッグメッセージ');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe('DEBUG');
      expect(logEntry.message).toBe('デバッグメッセージ');
    });
  });

  describe('デフォルトインスタンス', () => {
    it('logger がエクスポートされている', () => {
      expect(logger).toBeInstanceOf(Logger);
    });
  });
});
