/**
 * TradingViewQuoteProvider ユニットテスト
 *
 * DI したモック関数への委譲を検証する。
 * TradingView ライブラリには依存しない。
 */

import { TradingViewQuoteProvider } from '../../../../src/services/market-data/tradingview-quote-provider';
import type { GetCurrentPriceFn } from '../../../../src/services/market-data/tradingview-quote-provider';

describe('TradingViewQuoteProvider', () => {
  describe('委譲の検証', () => {
    test('DI した価格取得関数にそのまま委譲される', async () => {
      // Arrange
      const mockGetPrice: jest.MockedFunction<GetCurrentPriceFn> = jest
        .fn()
        .mockResolvedValue(200.0);
      const provider = new TradingViewQuoteProvider(mockGetPrice);

      // Act
      const price = await provider.getCurrentPrice('NASDAQ:AAPL');

      // Assert
      expect(price).toBe(200.0);
      expect(mockGetPrice).toHaveBeenCalledWith('NASDAQ:AAPL', undefined);
    });

    test('tickerId が正しく委譲先に渡される', async () => {
      // Arrange
      const mockGetPrice: jest.MockedFunction<GetCurrentPriceFn> = jest
        .fn()
        .mockResolvedValue(3000.0);
      const provider = new TradingViewQuoteProvider(mockGetPrice);

      // Act
      await provider.getCurrentPrice('TSE:6501');

      // Assert
      expect(mockGetPrice).toHaveBeenCalledWith('TSE:6501', undefined);
    });

    test('options が正しく委譲先に渡される', async () => {
      // Arrange
      const mockGetPrice: jest.MockedFunction<GetCurrentPriceFn> = jest
        .fn()
        .mockResolvedValue(150.0);
      const provider = new TradingViewQuoteProvider(mockGetPrice);
      const options = { timeout: 5000, session: 'regular' as const };

      // Act
      await provider.getCurrentPrice('NYSE:PFE', options);

      // Assert
      expect(mockGetPrice).toHaveBeenCalledWith('NYSE:PFE', options);
    });

    test('委譲先がエラーをスローした場合はそのまま伝播する', async () => {
      // Arrange
      const errorMessage = 'TradingView API のタイムアウトが発生しました';
      const mockGetPrice: jest.MockedFunction<GetCurrentPriceFn> = jest
        .fn()
        .mockRejectedValue(new Error(errorMessage));
      const provider = new TradingViewQuoteProvider(mockGetPrice);

      // Act & Assert
      await expect(provider.getCurrentPrice('NASDAQ:AAPL')).rejects.toThrow(errorMessage);
    });

    test('DI 関数は 1 回だけ呼び出される', async () => {
      // Arrange
      const mockGetPrice: jest.MockedFunction<GetCurrentPriceFn> = jest
        .fn()
        .mockResolvedValue(100.0);
      const provider = new TradingViewQuoteProvider(mockGetPrice);

      // Act
      await provider.getCurrentPrice('NYSE:PFE');

      // Assert
      expect(mockGetPrice).toHaveBeenCalledTimes(1);
    });
  });

  describe('QuoteProvider インターフェース適合', () => {
    test('getCurrentPrice メソッドを持つ', () => {
      // Arrange
      const mockGetPrice: jest.MockedFunction<GetCurrentPriceFn> = jest
        .fn()
        .mockResolvedValue(100.0);
      const provider = new TradingViewQuoteProvider(mockGetPrice);

      // Assert
      expect(typeof provider.getCurrentPrice).toBe('function');
    });

    test('options を省略して呼び出せる', async () => {
      // Arrange
      const mockGetPrice: jest.MockedFunction<GetCurrentPriceFn> = jest
        .fn()
        .mockResolvedValue(100.0);
      const provider = new TradingViewQuoteProvider(mockGetPrice);

      // Act & Assert（エラーなく完了すること）
      await expect(provider.getCurrentPrice('TSE:6501')).resolves.toBe(100.0);
    });
  });
});
