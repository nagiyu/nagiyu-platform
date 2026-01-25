import type { LogLevel, LogContext, LogEntry, Logger } from './types.js';

/**
 * ログレベルの優先度マップ
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/**
 * 環境変数からログレベルを取得
 * @returns 設定されたログレベル（デフォルト: INFO）
 */
function getLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();

  // 有効なログレベルかチェック
  if (envLevel === 'DEBUG' || envLevel === 'INFO' || envLevel === 'WARN' || envLevel === 'ERROR') {
    return envLevel;
  }

  // 無効な値が設定されている場合は警告を出力してデフォルト値を使用
  if (envLevel !== undefined && envLevel !== '') {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'WARN',
        message: `Invalid LOG_LEVEL: "${envLevel}". Using default "INFO".`,
      })
    );
  }

  return 'INFO';
}

/**
 * ログが出力されるべきかを判定
 * @param level - 出力しようとしているログレベル
 * @param configuredLevel - 設定されている最小ログレベル
 * @returns 出力すべきかどうか
 */
function shouldLog(level: LogLevel, configuredLevel: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[configuredLevel];
}

/**
 * ログエントリを生成
 * @param level - ログレベル
 * @param message - ログメッセージ
 * @param context - オプションのコンテキスト情報
 * @returns ログエントリ
 */
function createLogEntry(level: LogLevel, message: string, context?: LogContext): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (context !== undefined) {
    entry.context = context;
  }

  return entry;
}

/**
 * ログエントリをJSON形式で出力
 * @param entry - ログエントリ
 * @param useStderr - 標準エラー出力を使用するか
 */
function outputLog(entry: LogEntry, useStderr: boolean): void {
  try {
    const jsonLog = JSON.stringify(entry);
    if (useStderr) {
      console.error(jsonLog);
    } else {
      console.log(jsonLog);
    }
  } catch (error) {
    // JSON.stringify が失敗した場合（循環参照など）
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: 'Failed to stringify log entry',
        context: {
          error: error instanceof Error ? error.message : 'Unknown error',
          originalMessage: entry.message,
          originalLevel: entry.level,
        },
      })
    );
  }
}

/**
 * ロガーインスタンスを作成
 * @returns ロガーインスタンス
 */
function createLogger(): Logger {
  const configuredLevel = getLogLevel();

  return {
    debug(message: string, context?: LogContext): void {
      if (shouldLog('DEBUG', configuredLevel)) {
        const entry = createLogEntry('DEBUG', message, context);
        outputLog(entry, false); // stdout
      }
    },

    info(message: string, context?: LogContext): void {
      if (shouldLog('INFO', configuredLevel)) {
        const entry = createLogEntry('INFO', message, context);
        outputLog(entry, false); // stdout
      }
    },

    warn(message: string, context?: LogContext): void {
      if (shouldLog('WARN', configuredLevel)) {
        const entry = createLogEntry('WARN', message, context);
        outputLog(entry, true); // stderr
      }
    },

    error(message: string, context?: LogContext): void {
      if (shouldLog('ERROR', configuredLevel)) {
        const entry = createLogEntry('ERROR', message, context);
        outputLog(entry, true); // stderr
      }
    },
  };
}

/**
 * グローバルロガーインスタンス
 */
export const logger: Logger = createLogger();
