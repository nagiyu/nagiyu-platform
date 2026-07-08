/**
 * Finnhub QuoteProvider
 *
 * Finnhub 無料 /quote エンドポイントを使用して US 株の現在価格を取得する。
 * レスポンスの `c`（current price）フィールドを現在価格として返す。
 */

import type { GetCurrentPriceOptions } from '../tradingview-client.js';
import type { QuoteProvider } from './types.js';

/**
 * Finnhub API エラーメッセージ定数
 *
 * 日本語エラーメッセージを定数化（コーディング規約に準拠）
 */
export const FINNHUB_ERROR_MESSAGES = {
  NO_API_KEY: 'Finnhub API キーが設定されていません（環境変数 FINNHUB_API_KEY を設定してください）',
  INVALID_TICKER: '無効なティッカーIDです（形式: "EXCHANGE:SYMBOL"）',
  RATE_LIMIT: 'Finnhub API のレート制限に達しました（HTTP 429）',
  API_ERROR: 'Finnhub API からエラーが返されました',
  NO_DATA: '価格データが取得できませんでした（未知シンボルまたはデータなし）',
  TIMEOUT: 'Finnhub API へのリクエストがタイムアウトしました',
} as const;

/**
 * Finnhub /quote API レスポンス型
 */
type FinnhubQuoteResponse = {
  /** 現在価格（Current price） */
  c: number;
  /** 前日比変化額（Change） */
  d: number;
  /** 前日比変化率（Percent change） */
  dp: number;
  /** 当日高値（High price of the day） */
  h: number;
  /** 当日安値（Low price of the day） */
  l: number;
  /** 始値（Open price of the day） */
  o: number;
  /** 前日終値（Previous close price） */
  pc: number;
  /** タイムスタンプ（UNIX timestamp） */
  t: number;
};

/**
 * FinnhubQuoteProvider コンストラクタ引数
 */
export type FinnhubQuoteProviderOptions = {
  /** Finnhub API キー（省略時は環境変数 FINNHUB_API_KEY を使用） */
  apiKey?: string;
  /** Finnhub API ベース URL（省略時は "https://finnhub.io/api/v1"） */
  baseUrl?: string;
  /** fetch 関数（テスト注入用、省略時は global fetch を使用） */
  fetchFn?: typeof fetch;
};

/**
 * デフォルトタイムアウト時間（ミリ秒）
 */
const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Finnhub QuoteProvider
 *
 * Finnhub 無料 /quote エンドポイントを使用して US 株の現在価格を取得する。
 * US 銘柄の分次バッチ処理における TradingView タイムアウト問題を回避するために使用する。
 */
export class FinnhubQuoteProvider implements QuoteProvider {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  /**
   * @param options - プロバイダーオプション
   */
  constructor(options: FinnhubQuoteProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env['FINNHUB_API_KEY'];
    this.baseUrl = options.baseUrl ?? 'https://finnhub.io/api/v1';
    this.fetchFn = options.fetchFn ?? fetch;
  }

  /**
   * Finnhub から現在価格を取得する
   *
   * @param tickerId - ティッカーID（例: "NASDAQ:AAPL"）
   * @param options - 取得オプション（タイムアウト等）
   * @returns 現在価格
   * @throws {Error} API キー未設定、無効ティッカー、レート制限、タイムアウト、データなし等
   */
  async getCurrentPrice(tickerId: string, options: GetCurrentPriceOptions = {}): Promise<number> {
    // API キーの検証
    if (!this.apiKey) {
      throw new Error(FINNHUB_ERROR_MESSAGES.NO_API_KEY);
    }

    // ティッカーID のバリデーション
    if (!tickerId || !tickerId.includes(':')) {
      throw new Error(FINNHUB_ERROR_MESSAGES.INVALID_TICKER);
    }

    const parts = tickerId.split(':');
    const symbol = parts[1];

    if (!symbol) {
      throw new Error(FINNHUB_ERROR_MESSAGES.INVALID_TICKER);
    }

    const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
    const url = `${this.baseUrl}/quote?symbol=${encodeURIComponent(symbol)}&token=${this.apiKey}`;

    // AbortController でタイムアウト制御
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(url, { signal: controller.signal });
    } catch (error) {
      // AbortError はタイムアウトエラーとして扱う
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(FINNHUB_ERROR_MESSAGES.TIMEOUT);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    // HTTP ステータスコードの検証
    if (response.status === 429) {
      throw new Error(FINNHUB_ERROR_MESSAGES.RATE_LIMIT);
    }

    if (!response.ok) {
      throw new Error(`${FINNHUB_ERROR_MESSAGES.API_ERROR}（HTTP ${response.status}）`);
    }

    const data = (await response.json()) as FinnhubQuoteResponse;

    // 価格データの検証
    // 未知シンボルは全フィールド 0（c:0）で返る
    if (typeof data.c !== 'number' || data.c <= 0) {
      throw new Error(FINNHUB_ERROR_MESSAGES.NO_DATA);
    }

    return data.c;
  }
}
