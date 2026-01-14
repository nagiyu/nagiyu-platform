/**
 * 1分間隔バッチ処理のLambda Handler
 * EventBridge Scheduler から rate(1 minute) で実行される
 * MINUTE_LEVEL のアラート条件をチェックして通知を送信する
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
  logger.info('1分間隔バッチ処理を開始します', {
    eventId: event.id,
    eventTime: event.time,
  });

  try {
    // TODO: Phase 3 で実装
    // 1. GSI2 で MINUTE_LEVEL アラート一覧を取得
    // 2. 各アラートに対して:
    //    - Enabled = true かチェック
    //    - 取引時間外チェック
    //    - TradingView API で現在価格取得
    //    - アラート条件評価
    //    - 条件達成時、Web Push 通知送信

    logger.info('1分間隔バッチ処理が正常に完了しました', {
      eventId: event.id,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: '1分間隔バッチ処理が正常に完了しました',
      }),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('1分間隔バッチ処理でエラーが発生しました', {
      eventId: event.id,
      error: errorMessage,
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: '1分間隔バッチ処理でエラーが発生しました',
        error: errorMessage,
      }),
    };
  }
}
