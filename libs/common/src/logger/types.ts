/**
 * ログレベル
 * - DEBUG: 開発時のデバッグ情報
 * - INFO: 通常の動作ログ
 * - WARN: 警告（システムは動作中）
 * - ERROR: エラー（要対応）
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/**
 * ログのコンテキスト情報
 * 任意のキー・値ペアを格納可能
 */
export type LogContext = Record<string, unknown>;

/**
 * ログエントリの構造
 */
export interface LogEntry {
  /** ISO 8601形式のタイムスタンプ */
  timestamp: string;
  /** ログレベル */
  level: LogLevel;
  /** ログメッセージ */
  message: string;
  /** オプションのコンテキスト情報 */
  context?: LogContext;
}

/**
 * ロガーインターフェース
 */
export interface Logger {
  /**
   * DEBUGレベルのログを出力
   * @param message - ログメッセージ
   * @param context - オプションのコンテキスト情報
   */
  debug(message: string, context?: LogContext): void;

  /**
   * INFOレベルのログを出力
   * @param message - ログメッセージ
   * @param context - オプションのコンテキスト情報
   */
  info(message: string, context?: LogContext): void;

  /**
   * WARNレベルのログを出力
   * @param message - ログメッセージ
   * @param context - オプションのコンテキスト情報
   */
  warn(message: string, context?: LogContext): void;

  /**
   * ERRORレベルのログを出力
   * @param message - ログメッセージ
   * @param context - オプションのコンテキスト情報
   */
  error(message: string, context?: LogContext): void;
}
