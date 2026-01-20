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
import type { TimeFrame } from '@mathieuc/tradingview';
import type { ChartDataPoint } from '../types.js';

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
  INVALID_TIMEFRAME: '無効なタイムフレームです',
} as const;

/**
 * Phase 1 で対応するタイムフレーム
 *
 * "1": 1分足
 * "5": 5分足
 * "60": 1時間足
 * "D": 日足
 *
 * Note: TimeFrame 型は @types/mathieuc__tradingview で定義されている
 */
export const SUPPORTED_TIMEFRAMES: readonly TimeFrame[] = ['1', '5', '60', 'D'] as const;

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

/**
 * 最大取得件数
 *
 * チャートデータの最大取得件数（API 仕様に準拠）
 */
const MAX_CHART_DATA_COUNT = 500;

/**
 * チャートデータ取得オプション
 */
export type GetChartDataOptions = {
  /** タイムアウト時間（ミリ秒） - デフォルト: 10000ms */
  timeout?: number;
  /** セッションタイプ - デフォルト: 'extended'（時間外取引を含む） */
  session?: 'regular' | 'extended';
  /** 取得件数 - デフォルト: 30、最大: 500 */
  count?: number;
};

/**
 * TradingView API からチャートデータを取得
 *
 * WebSocket 接続でチャートデータを取得し、OHLCV 形式で返す
 * リソース管理のため、chart.delete() と client.end() を必ず呼び出す
 *
 * @param tickerId - ティッカーID（例: "NSDQ:AAPL", "NYSE:TSLA"）
 * @param timeframe - タイムフレーム（Phase 1: "1", "5", "60", "D"）
 * @param options - 取得オプション
 * @returns チャートデータポイントの配列（OHLCV 形式）
 * @throws {Error} タイムアウト、接続エラー、データ取得失敗時
 *
 * @example
 * ```typescript
 * const chartData = await getChartData('NSDQ:AAPL', '60', { count: 100 });
 * console.log(`取得件数: ${chartData.length}`);
 * ```
 */
export async function getChartData(
  tickerId: string,
  timeframe: TimeFrame,
  options: GetChartDataOptions = {}
): Promise<ChartDataPoint[]> {
  const { timeout = 10000, session = 'extended', count = 30 } = options;

  // ティッカーIDのバリデーション（基本的なフォーマットチェック）
  if (!tickerId || typeof tickerId !== 'string' || !tickerId.includes(':')) {
    throw new Error(TRADINGVIEW_ERROR_MESSAGES.INVALID_TICKER);
  }

  // タイムフレームのバリデーション
  if (!SUPPORTED_TIMEFRAMES.includes(timeframe)) {
    throw new Error(TRADINGVIEW_ERROR_MESSAGES.INVALID_TIMEFRAME);
  }

  const client = new TradingView.Client();
  const chart = new client.Session.Chart();

  try {
    // タイムアウト処理のためのPromiseを作成
    const chartDataPromise = new Promise<ChartDataPoint[]>((resolve, reject) => {
      let resolved = false;

      // タイムアウトタイマー設定
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error(TRADINGVIEW_ERROR_MESSAGES.TIMEOUT));
        }
      }, timeout);

      // チャート設定: ティッカーIDとタイムフレームを指定
      chart.setMarket(tickerId, {
        timeframe,
        session,
      });

      // データ更新時のコールバック
      chart.onUpdate(() => {
        if (!resolved && chart.periods && chart.periods.length > 0) {
          // chart.periods から OHLCV データを取得
          // periods は最新データから古いデータの順に並んでいる
          const chartData: ChartDataPoint[] = [];

          // 指定された件数分のデータを取得（最大500件）
          const maxCount = Math.min(count, MAX_CHART_DATA_COUNT);
          const dataCount = Math.min(chart.periods.length, maxCount);

          for (let i = 0; i < dataCount; i++) {
            const period = chart.periods[i];

            // OHLCV データが揃っているか確認
            // TradingView API の PricePeriod では high/low が max/min として提供される
            if (
              period &&
              period.time !== undefined &&
              period.open !== undefined &&
              period.max !== undefined &&
              period.min !== undefined &&
              period.close !== undefined &&
              period.volume !== undefined
            ) {
              chartData.push({
                time: period.time,
                open: period.open,
                high: period.max,
                low: period.min,
                close: period.close,
                volume: period.volume,
              });
            }
          }

          // データが取得できた場合のみ resolve
          if (chartData.length > 0) {
            resolved = true;
            clearTimeout(timeoutId);
            resolve(chartData);
          }
        }
      });

      // エラーハンドリング
      chart.onError((error: Error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);

          // レート制限エラーの検出
          const errorMessage = error.message || '';
          if (errorMessage.includes('rate') || errorMessage.includes('limit')) {
            reject(new Error(TRADINGVIEW_ERROR_MESSAGES.RATE_LIMIT));
          } else {
            reject(new Error(`${TRADINGVIEW_ERROR_MESSAGES.CONNECTION_ERROR}: ${errorMessage}`));
          }
        }
      });
    });

    return await chartDataPromise;
  } finally {
    // リソース管理: chart と client を必ずクリーンアップ
    try {
      chart.delete();
    } catch (error) {
      // chart.delete() のエラーはログ出力のみ（既に削除済みの可能性）
      console.debug('Error deleting chart (might be already deleted):', error);
    }

    try {
      client.end();
    } catch (error) {
      // client.end() のエラーはログ出力のみ（既に終了済みの可能性）
      console.debug('Error ending client (might be already ended):', error);
    }
  }
}
