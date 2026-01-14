/**
 * 日次バッチ処理のLambda Handler
 * EventBridge Scheduler から cron(0 0 * * ? *) で実行される（日本時間 9:00）
 * データクリーンアップを実行する
 */

import { logger } from './lib/logger.js';

/**
 * Lambda Handlerイベント型
 */
export interface ScheduledEvent {
  version: string;
  id: string;
  'detail-type': string;
  source: string;
  account: string;
  time: string;
  region: string;
  resources: string[];
  detail: Record<string, unknown>;
}

/**
 * Lambda Handler レスポンス型
 */
export interface HandlerResponse {
  statusCode: number;
  body: string;
}

/**
 * Lambda Handler
 * EventBridge Scheduler から定期実行される
 */
export async function handler(event: ScheduledEvent): Promise<HandlerResponse> {
  logger.info('日次バッチ処理を開始します', {
    eventId: event.id,
    eventTime: event.time,
  });

  try {
    // TODO: Phase 3 で実装
    // Phase 1 では最小限の実装
    // - 無効な Web Push サブスクリプションの検出（Phase 1 では手動削除のみ）
    // - ログ出力

    logger.info('日次バッチ処理が正常に完了しました', {
      eventId: event.id,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: '日次バッチ処理が正常に完了しました',
      }),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('日次バッチ処理でエラーが発生しました', {
      eventId: event.id,
      error: errorMessage,
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: '日次バッチ処理でエラーが発生しました',
        error: errorMessage,
      }),
    };
  }
}
