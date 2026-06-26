/**
 * resolveQuoteProvider ルーター ユニットテスト
 *
 * TickerID の取引所プレフィックスに基づいた provider 選択ロジックを検証する。
 */

import {
  resolveQuoteProvider,
  US_EXCHANGE_KEYS,
} from '../../../../src/services/market-data/router';
import type { QuoteProvider } from '../../../../src/services/market-data/types';

/**
 * テスト用モック QuoteProvider を生成するヘルパー
 */
function createMockProvider(name: string): QuoteProvider {
  return {
    getCurrentPrice: jest.fn().mockResolvedValue(0),
    // テスト識別用（型には存在しないが検証に使用）
    _name: name,
  } as unknown as QuoteProvider;
}

describe('resolveQuoteProvider', () => {
  let finnhubProvider: QuoteProvider;
  let tradingViewProvider: QuoteProvider;

  beforeEach(() => {
    finnhubProvider = createMockProvider('finnhub');
    tradingViewProvider = createMockProvider('tradingView');
  });

  describe('US 取引所（Finnhub を選択）', () => {
    test('NASDAQ:AAPL は Finnhub provider を返す', () => {
      // Act
      const provider = resolveQuoteProvider('NASDAQ:AAPL', {
        tradingView: tradingViewProvider,
        finnhub: finnhubProvider,
      });

      // Assert
      expect(provider).toBe(finnhubProvider);
    });

    test('NYSE:PFE は Finnhub provider を返す', () => {
      // Act
      const provider = resolveQuoteProvider('NYSE:PFE', {
        tradingView: tradingViewProvider,
        finnhub: finnhubProvider,
      });

      // Assert
      expect(provider).toBe(finnhubProvider);
    });

    test('AMEX:xxx は Finnhub provider を返す', () => {
      // Act
      const provider = resolveQuoteProvider('AMEX:xxx', {
        tradingView: tradingViewProvider,
        finnhub: finnhubProvider,
      });

      // Assert
      expect(provider).toBe(finnhubProvider);
    });
  });

  describe('JP 取引所（TradingView を選択）', () => {
    test('TSE:6501 は TradingView provider を返す', () => {
      // Act
      const provider = resolveQuoteProvider('TSE:6501', {
        tradingView: tradingViewProvider,
        finnhub: finnhubProvider,
      });

      // Assert
      expect(provider).toBe(tradingViewProvider);
    });

    test('TSE:7203 は TradingView provider を返す', () => {
      // Act
      const provider = resolveQuoteProvider('TSE:7203', {
        tradingView: tradingViewProvider,
        finnhub: finnhubProvider,
      });

      // Assert
      expect(provider).toBe(tradingViewProvider);
    });
  });

  describe('未知プレフィックス（安全側デフォルト = TradingView）', () => {
    test('FOO:1 は TradingView provider を返す（安全側デフォルト）', () => {
      // Act
      const provider = resolveQuoteProvider('FOO:1', {
        tradingView: tradingViewProvider,
        finnhub: finnhubProvider,
      });

      // Assert
      expect(provider).toBe(tradingViewProvider);
    });

    test('UNKNOWN:AAPL は TradingView provider を返す（安全側デフォルト）', () => {
      // Act
      const provider = resolveQuoteProvider('UNKNOWN:AAPL', {
        tradingView: tradingViewProvider,
        finnhub: finnhubProvider,
      });

      // Assert
      expect(provider).toBe(tradingViewProvider);
    });

    test('コロンなしの文字列は TradingView provider を返す（安全側デフォルト）', () => {
      // Act
      const provider = resolveQuoteProvider('AAPL', {
        tradingView: tradingViewProvider,
        finnhub: finnhubProvider,
      });

      // Assert
      expect(provider).toBe(tradingViewProvider);
    });

    test('空文字列は TradingView provider を返す（安全側デフォルト）', () => {
      // Act
      const provider = resolveQuoteProvider('', {
        tradingView: tradingViewProvider,
        finnhub: finnhubProvider,
      });

      // Assert
      expect(provider).toBe(tradingViewProvider);
    });

    test('小文字の nasdaq: は TradingView provider を返す（大文字小文字区別）', () => {
      // Act: 大文字小文字を区別するため小文字は未知プレフィックス扱い
      const provider = resolveQuoteProvider('nasdaq:AAPL', {
        tradingView: tradingViewProvider,
        finnhub: finnhubProvider,
      });

      // Assert: 安全側デフォルトとして TradingView
      expect(provider).toBe(tradingViewProvider);
    });
  });

  describe('US_EXCHANGE_KEYS の内容確認', () => {
    test('NASDAQ, NYSE, AMEX が含まれる', () => {
      expect(US_EXCHANGE_KEYS.has('NASDAQ')).toBe(true);
      expect(US_EXCHANGE_KEYS.has('NYSE')).toBe(true);
      expect(US_EXCHANGE_KEYS.has('AMEX')).toBe(true);
    });

    test('TSE は含まれない', () => {
      expect(US_EXCHANGE_KEYS.has('TSE')).toBe(false);
    });
  });
});
