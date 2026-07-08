/**
 * resolveQuoteProvider ルーター ユニットテスト
 *
 * Exchange.PriceSource に基づいた provider 選択ロジックを検証する。
 */

import { resolveQuoteProvider } from '../../../../src/services/market-data/router';
import type { QuoteProvider } from '../../../../src/services/market-data/types';
import type { PriceSource } from '../../../../src/entities/exchange.entity';

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

  describe("PriceSource = 'finnhub'（Finnhub provider を選択）", () => {
    test("priceSource が 'finnhub' の場合、Finnhub provider を返す", () => {
      // Arrange
      const priceSource: PriceSource = 'finnhub';

      // Act
      const provider = resolveQuoteProvider(priceSource, {
        tradingView: tradingViewProvider,
        finnhub: finnhubProvider,
      });

      // Assert
      expect(provider).toBe(finnhubProvider);
    });
  });

  describe("PriceSource = 'tradingview'（TradingView provider を選択）", () => {
    test("priceSource が 'tradingview' の場合、TradingView provider を返す", () => {
      // Arrange
      const priceSource: PriceSource = 'tradingview';

      // Act
      const provider = resolveQuoteProvider(priceSource, {
        tradingView: tradingViewProvider,
        finnhub: finnhubProvider,
      });

      // Assert
      expect(provider).toBe(tradingViewProvider);
    });
  });

  describe('安全側デフォルト（TradingView）', () => {
    test("PriceSource が 'tradingview' の場合は Finnhub を呼ばない", () => {
      // Arrange
      const priceSource: PriceSource = 'tradingview';

      // Act
      const provider = resolveQuoteProvider(priceSource, {
        tradingView: tradingViewProvider,
        finnhub: finnhubProvider,
      });

      // Assert: tradingview の場合は TradingView provider を返す（Finnhub ではない）
      expect(provider).toBe(tradingViewProvider);
    });

    test("PriceSource が 'finnhub' の場合は TradingView を返さない", () => {
      // Arrange
      const priceSource: PriceSource = 'finnhub';

      // Act
      const provider = resolveQuoteProvider(priceSource, {
        tradingView: tradingViewProvider,
        finnhub: finnhubProvider,
      });

      // Assert
      expect(provider).not.toBe(tradingViewProvider);
      expect(provider).toBe(finnhubProvider);
    });
  });

  describe('プロバイダーが正しく区別される', () => {
    test('同じマップから finnhub と tradingview が別 provider を返す', () => {
      // Arrange
      const providers = {
        tradingView: tradingViewProvider,
        finnhub: finnhubProvider,
      };

      // Act
      const providerA = resolveQuoteProvider('finnhub', providers);
      const providerB = resolveQuoteProvider('tradingview', providers);

      // Assert
      expect(providerA).toBe(finnhubProvider);
      expect(providerB).toBe(tradingViewProvider);
      expect(providerA).not.toBe(providerB);
    });
  });
});
