/**
 * 構造化ログ出力ユーティリティ
 * CloudWatch Logs に構造化ログとして出力する
 */

/**
 * ログレベル
 */
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

/**
 * ログエントリ
 */
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: Record<string, unknown>;
}

/**
 * 構造化ログを出力する
 */
export class Logger {
    /**
     * INFOレベルのログを出力
     */
    info(message: string, context?: Record<string, unknown>): void {
        this.log('INFO', message, context);
    }

    /**
     * WARNレベルのログを出力
     */
    warn(message: string, context?: Record<string, unknown>): void {
        this.log('WARN', message, context);
    }

    /**
     * ERRORレベルのログを出力
     */
    error(message: string, context?: Record<string, unknown>): void {
        this.log('ERROR', message, context);
    }

    /**
     * DEBUGレベルのログを出力
     */
    debug(message: string, context?: Record<string, unknown>): void {
        this.log('DEBUG', message, context);
    }

    /**
     * ログを出力する（内部メソッド）
     */
    private log(
        level: LogLevel,
        message: string,
        context?: Record<string, unknown>,
    ): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...(context && { context }),
        };

        // CloudWatch Logs では JSON 形式で出力すると構造化ログとして認識される
        console.log(JSON.stringify(entry));
    }
}

/**
 * デフォルトのLoggerインスタンス
 */
export const logger = new Logger();
