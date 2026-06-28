/**
 * TradingView QuoteProvider アダプタ
 *
 * 既存の getCurrentPrice 関数を QuoteProvider インターフェースへ適合させる薄いアダプタ。
 * 既存の tradingview-client.ts は変更せず、委譲のみ行う。
 */

import {
  getCurrentPrice as defaultGetCurrentPrice,
  type GetCurrentPriceOptions,
} from '../tradingview-client.js';
import type { QuoteProvider } from './types.js';

/**
 * 価格取得関数の型
 *
 * DI 用（テスト時にモック関数を注入可能にする）
 */
export type GetCurrentPriceFn = (
  tickerId: string,
  options?: GetCurrentPriceOptions
) => Promise<number>;

/**
 * TradingView QuoteProvider
 *
 * tradingview-client の getCurrentPrice 関数を QuoteProvider インターフェースに適合させる。
 * コンストラクタで価格取得関数を DI 可能にし、既定は既存 module 関数を委譲する。
 */
export class TradingViewQuoteProvider implements QuoteProvider {
  private readonly getPrice: GetCurrentPriceFn;

  /**
   * @param getPrice - 価格取得関数（省略時は tradingview-client の getCurrentPrice を使用）
   */
  constructor(getPrice?: GetCurrentPriceFn) {
    this.getPrice = getPrice ?? defaultGetCurrentPrice;
  }

  /**
   * TradingView から現在価格を取得する
   *
   * @param tickerId - ティッカーID（例: "NASDAQ:AAPL", "TSE:6501"）
   * @param options - 取得オプション
   * @returns 現在価格
   */
  async getCurrentPrice(tickerId: string, options?: GetCurrentPriceOptions): Promise<number> {
    return this.getPrice(tickerId, options);
  }
}
