/**
 * TradingView API クライアント
 *
 * TradingView API から株価データを取得する
 * WebSocket 接続を使用してリアルタイムデータを取得し、適切なリソース管理を実施
 *
 * Phase 1 仕様:
 * - 現在価格の取得のみ（getCurrentPrice）
 * - タイムアウト: 10秒
 * - エラーハンドリング: タイムアウト、接続エラー、レート制限
 * - リソース管理: chart.delete() と client.end() を必ず実行
 */

import * as TradingView from '@mathieuc/tradingview';

/**
 * TradingView API エラーメッセージ定数
 *
 * 日本語エラーメッセージを定数化（コーディング規約に準拠）
 */
export const TRADINGVIEW_ERROR_MESSAGES = {
  TIMEOUT: 'TradingView API のタイムアウトが発生しました',
  NO_DATA: '株価データが取得できませんでした',
  INVALID_TICKER: '無効なティッカーIDです',
  CONNECTION_ERROR: 'TradingView API への接続に失敗しました',
  RATE_LIMIT: 'TradingView API のレート制限に達しました',
} as const;

/**
 * TradingView API から現在価格を取得するオプション
 */
export type GetCurrentPriceOptions = {
  /** タイムアウト時間（ミリ秒） - デフォルト: 10000ms */
  timeout?: number;
  /** セッションタイプ - デフォルト: 'extended'（時間外取引を含む） */
  session?: 'regular' | 'extended';
};

/**
 * TradingView API から現在価格を取得
 *
 * WebSocket 接続で現在価格を取得し、タイムアウトとエラーハンドリングを実施
 * リソース管理のため、chart.delete() と client.end() を必ず呼び出す
 *
 * @param tickerId - ティッカーID（例: "NSDQ:AAPL", "NYSE:TSLA"）
 * @param options - 取得オプション
 * @returns 現在価格（終値）
 * @throws {Error} タイムアウト、接続エラー、データ取得失敗時
 *
 * @example
 * ```typescript
 * const price = await getCurrentPrice('NSDQ:AAPL');
 * console.log(`現在価格: ${price} USD`);
 * ```
 */
export async function getCurrentPrice(
  tickerId: string,
  options: GetCurrentPriceOptions = {}
): Promise<number> {
  const { timeout = 10000, session = 'extended' } = options;

  // ティッカーIDのバリデーション（基本的なフォーマットチェック）
  if (!tickerId || typeof tickerId !== 'string' || !tickerId.includes(':')) {
    throw new Error(TRADINGVIEW_ERROR_MESSAGES.INVALID_TICKER);
  }

  const client = new TradingView.Client();
  const chart = new client.Session.Chart();

  try {
    // タイムアウト処理のためのPromiseを作成
    const pricePromise = new Promise<number>((resolve, reject) => {
      let resolved = false;

      // タイムアウトタイマー設定
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error(TRADINGVIEW_ERROR_MESSAGES.TIMEOUT));
        }
      }, timeout);

      // チャート設定: ティッカーIDを指定してマーケットを設定
      // timeframe: '1' = 1分足（リアルタイム監視に適したインターバル）
      chart.setMarket(tickerId, {
        timeframe: '1',
        session,
      });

      // データ更新時のコールバック
      chart.onUpdate(() => {
        if (!resolved && chart.periods && chart.periods.length > 0) {
          const currentPrice = chart.periods[0]?.close;

          if (currentPrice !== undefined && currentPrice !== null) {
            resolved = true;
            clearTimeout(timeoutId);
            resolve(currentPrice);
          }
        }
      });

      // エラーハンドリング
      chart.onError((error: Error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);

          // レート制限エラーの検出（TradingView API からのエラーメッセージに基づく）
          const errorMessage = error.message || '';
          if (errorMessage.includes('rate') || errorMessage.includes('limit')) {
            reject(new Error(TRADINGVIEW_ERROR_MESSAGES.RATE_LIMIT));
          } else {
            reject(new Error(`${TRADINGVIEW_ERROR_MESSAGES.CONNECTION_ERROR}: ${errorMessage}`));
          }
        }
      });
    });

    return await pricePromise;
  } finally {
    // リソース管理: chart と client を必ずクリーンアップ
    // finally ブロックで実行することで、エラー時も必ず呼び出される
    try {
      chart.delete();
    } catch {
      // chart.delete() のエラーは無視（既に削除済みの可能性）
    }

    try {
      client.end();
    } catch {
      // client.end() のエラーは無視（既に終了済みの可能性）
    }
  }
}
