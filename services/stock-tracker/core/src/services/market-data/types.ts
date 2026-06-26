/**
 * market-data 共通型定義
 *
 * QuoteProvider インターフェースと関連型を定義する。
 * GetCurrentPriceOptions は tradingview-client から re-export して再利用する。
 */

export type { GetCurrentPriceOptions } from '../tradingview-client.js';

/**
 * 現在価格取得プロバイダーのインターフェース
 *
 * 取引所やデータソースに依らず統一的に現在価格を取得する抽象
 */
export interface QuoteProvider {
  /**
   * 現在価格を取得する
   *
   * @param tickerId - ティッカーID（例: "NASDAQ:AAPL", "TSE:6501"）
   * @param options - 取得オプション（タイムアウト等）
   * @returns 現在価格
   * @throws {Error} 取得失敗時
   */
  getCurrentPrice(tickerId: string, options?: import('../tradingview-client.js').GetCurrentPriceOptions): Promise<number>;
}
