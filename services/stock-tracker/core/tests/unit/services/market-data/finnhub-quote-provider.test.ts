/**
 * FinnhubQuoteProvider ユニットテスト
 *
 * fetchFn をモック化して各種シナリオを検証する。
 * 外部 HTTP 通信は一切行わない。
 */

import {
  FinnhubQuoteProvider,
  FINNHUB_ERROR_MESSAGES,
} from '../../../../src/services/market-data/finnhub-quote-provider';

/**
 * モック fetch レスポンスを生成するヘルパー
 */
function createMockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    statusText: '',
    type: 'default',
    url: '',
  } as unknown as Response;
}

/**
 * Finnhub 正常レスポンスのモックデータ
 */
const VALID_QUOTE_RESPONSE = {
  c: 150.5,
  d: 2.3,
  dp: 1.55,
  h: 151.0,
  l: 148.0,
  o: 148.5,
  pc: 148.2,
  t: 1700000000,
};

/**
 * 未知シンボルの Finnhub レスポンス（全フィールド 0）
 */
const UNKNOWN_SYMBOL_RESPONSE = {
  c: 0,
  d: 0,
  dp: 0,
  h: 0,
  l: 0,
  o: 0,
  pc: 0,
  t: 0,
};

describe('FinnhubQuoteProvider', () => {
  const API_KEY = 'test-api-key';

  describe('正常系', () => {
    test('NASDAQ:AAPL から現在価格（c フィールド）を正しく返す', async () => {
      // Arrange
      const mockFetch = jest.fn().mockResolvedValue(createMockResponse(VALID_QUOTE_RESPONSE));
      const provider = new FinnhubQuoteProvider({ apiKey: API_KEY, fetchFn: mockFetch });

      // Act
      const price = await provider.getCurrentPrice('NASDAQ:AAPL');

      // Assert
      expect(price).toBe(150.5);
    });

    test('URL にシンボルが正しく含まれる（NASDAQ:AAPL → symbol=AAPL）', async () => {
      // Arrange
      const mockFetch = jest.fn().mockResolvedValue(createMockResponse(VALID_QUOTE_RESPONSE));
      const provider = new FinnhubQuoteProvider({ apiKey: API_KEY, fetchFn: mockFetch });

      // Act
      await provider.getCurrentPrice('NASDAQ:AAPL');

      // Assert
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('symbol=AAPL');
      expect(calledUrl).toContain(`token=${API_KEY}`);
    });

    test('カスタム baseUrl を使用してリクエストを送信する', async () => {
      // Arrange
      const customBaseUrl = 'https://custom.example.com/api/v2';
      const mockFetch = jest.fn().mockResolvedValue(createMockResponse(VALID_QUOTE_RESPONSE));
      const provider = new FinnhubQuoteProvider({
        apiKey: API_KEY,
        baseUrl: customBaseUrl,
        fetchFn: mockFetch,
      });

      // Act
      await provider.getCurrentPrice('NYSE:PFE');

      // Assert
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl.startsWith(customBaseUrl)).toBe(true);
      expect(calledUrl).toContain('symbol=PFE');
    });

    test('options.timeout を使用してタイムアウトを設定する', async () => {
      // Arrange: タイムアウトより先に正常レスポンスを返す
      const mockFetch = jest.fn().mockResolvedValue(createMockResponse(VALID_QUOTE_RESPONSE));
      const provider = new FinnhubQuoteProvider({ apiKey: API_KEY, fetchFn: mockFetch });

      // Act
      const price = await provider.getCurrentPrice('NYSE:PFE', { timeout: 5000 });

      // Assert: 正常終了していること
      expect(price).toBe(150.5);
    });
  });

  describe('異常系 - 未知シンボル', () => {
    test('c:0 の場合（未知シンボル）は NO_DATA エラーを投げる', async () => {
      // Arrange
      const mockFetch = jest.fn().mockResolvedValue(createMockResponse(UNKNOWN_SYMBOL_RESPONSE));
      const provider = new FinnhubQuoteProvider({ apiKey: API_KEY, fetchFn: mockFetch });

      // Act & Assert
      await expect(provider.getCurrentPrice('NASDAQ:UNKNOWNSYM')).rejects.toThrow(
        FINNHUB_ERROR_MESSAGES.NO_DATA
      );
    });

    test('c が負数の場合は NO_DATA エラーを投げる', async () => {
      // Arrange
      const negativeResponse = { ...VALID_QUOTE_RESPONSE, c: -1 };
      const mockFetch = jest.fn().mockResolvedValue(createMockResponse(negativeResponse));
      const provider = new FinnhubQuoteProvider({ apiKey: API_KEY, fetchFn: mockFetch });

      // Act & Assert
      await expect(provider.getCurrentPrice('NASDAQ:AAPL')).rejects.toThrow(
        FINNHUB_ERROR_MESSAGES.NO_DATA
      );
    });

    test('c が number でない場合は NO_DATA エラーを投げる', async () => {
      // Arrange
      const invalidResponse = { ...VALID_QUOTE_RESPONSE, c: 'not-a-number' };
      const mockFetch = jest.fn().mockResolvedValue(createMockResponse(invalidResponse));
      const provider = new FinnhubQuoteProvider({ apiKey: API_KEY, fetchFn: mockFetch });

      // Act & Assert
      await expect(provider.getCurrentPrice('NASDAQ:AAPL')).rejects.toThrow(
        FINNHUB_ERROR_MESSAGES.NO_DATA
      );
    });
  });

  describe('異常系 - HTTP エラー', () => {
    test('HTTP 429 の場合は RATE_LIMIT エラーを投げる', async () => {
      // Arrange
      const mockFetch = jest.fn().mockResolvedValue(createMockResponse({}, 429));
      const provider = new FinnhubQuoteProvider({ apiKey: API_KEY, fetchFn: mockFetch });

      // Act & Assert
      await expect(provider.getCurrentPrice('NASDAQ:AAPL')).rejects.toThrow(
        FINNHUB_ERROR_MESSAGES.RATE_LIMIT
      );
    });

    test('HTTP 500 の場合は API_ERROR メッセージを含むエラーを投げる', async () => {
      // Arrange
      const mockFetch = jest.fn().mockResolvedValue(createMockResponse({}, 500));
      const provider = new FinnhubQuoteProvider({ apiKey: API_KEY, fetchFn: mockFetch });

      // Act & Assert
      await expect(provider.getCurrentPrice('NASDAQ:AAPL')).rejects.toThrow(
        FINNHUB_ERROR_MESSAGES.API_ERROR
      );
    });

    test('HTTP 403 の場合は API_ERROR メッセージを含むエラーを投げる', async () => {
      // Arrange
      const mockFetch = jest.fn().mockResolvedValue(createMockResponse({}, 403));
      const provider = new FinnhubQuoteProvider({ apiKey: API_KEY, fetchFn: mockFetch });

      // Act & Assert
      await expect(provider.getCurrentPrice('NASDAQ:AAPL')).rejects.toThrow(
        FINNHUB_ERROR_MESSAGES.API_ERROR
      );
    });
  });

  describe('異常系 - タイムアウト', () => {
    test('AbortError が発生した場合は TIMEOUT エラーを投げる', async () => {
      // Arrange: AbortError をシミュレートする fetch
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      const mockFetch = jest.fn().mockRejectedValue(abortError);
      const provider = new FinnhubQuoteProvider({ apiKey: API_KEY, fetchFn: mockFetch });

      // Act & Assert
      await expect(provider.getCurrentPrice('NASDAQ:AAPL', { timeout: 100 })).rejects.toThrow(
        FINNHUB_ERROR_MESSAGES.TIMEOUT
      );
    });
  });

  describe('異常系 - API キー未設定', () => {
    test('apiKey が未設定かつ環境変数もない場合は NO_API_KEY エラーを投げる', async () => {
      // Arrange: 環境変数を削除
      const originalEnv = process.env['FINNHUB_API_KEY'];
      delete process.env['FINNHUB_API_KEY'];

      const mockFetch = jest.fn();
      const provider = new FinnhubQuoteProvider({ fetchFn: mockFetch });

      // Act & Assert
      await expect(provider.getCurrentPrice('NASDAQ:AAPL')).rejects.toThrow(
        FINNHUB_ERROR_MESSAGES.NO_API_KEY
      );

      // Cleanup
      if (originalEnv !== undefined) {
        process.env['FINNHUB_API_KEY'] = originalEnv;
      }
    });

    test('環境変数 FINNHUB_API_KEY が設定されている場合はそれを使用する', async () => {
      // Arrange
      const originalEnv = process.env['FINNHUB_API_KEY'];
      process.env['FINNHUB_API_KEY'] = 'env-api-key';

      const mockFetch = jest.fn().mockResolvedValue(createMockResponse(VALID_QUOTE_RESPONSE));
      const provider = new FinnhubQuoteProvider({ fetchFn: mockFetch });

      // Act
      const price = await provider.getCurrentPrice('NASDAQ:AAPL');

      // Assert
      expect(price).toBe(150.5);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('token=env-api-key');

      // Cleanup
      if (originalEnv !== undefined) {
        process.env['FINNHUB_API_KEY'] = originalEnv;
      } else {
        delete process.env['FINNHUB_API_KEY'];
      }
    });
  });

  describe('異常系 - 無効ティッカーID', () => {
    test('コロンなし tickerId は INVALID_TICKER エラーを投げる', async () => {
      // Arrange
      const mockFetch = jest.fn();
      const provider = new FinnhubQuoteProvider({ apiKey: API_KEY, fetchFn: mockFetch });

      // Act & Assert
      await expect(provider.getCurrentPrice('AAPL')).rejects.toThrow(
        FINNHUB_ERROR_MESSAGES.INVALID_TICKER
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('空文字 tickerId は INVALID_TICKER エラーを投げる', async () => {
      // Arrange
      const mockFetch = jest.fn();
      const provider = new FinnhubQuoteProvider({ apiKey: API_KEY, fetchFn: mockFetch });

      // Act & Assert
      await expect(provider.getCurrentPrice('')).rejects.toThrow(
        FINNHUB_ERROR_MESSAGES.INVALID_TICKER
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('"EXCHANGE:" のようにシンボル部分が空の場合は INVALID_TICKER エラーを投げる', async () => {
      // Arrange: "NASDAQ:" のようにコロンはあるがシンボルが空
      const mockFetch = jest.fn();
      const provider = new FinnhubQuoteProvider({ apiKey: API_KEY, fetchFn: mockFetch });

      // Act & Assert
      await expect(provider.getCurrentPrice('NASDAQ:')).rejects.toThrow(
        FINNHUB_ERROR_MESSAGES.INVALID_TICKER
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('シンボル抽出', () => {
    test('NASDAQ:AAPL からシンボル AAPL を抽出してリクエストする', async () => {
      // Arrange
      const mockFetch = jest.fn().mockResolvedValue(createMockResponse(VALID_QUOTE_RESPONSE));
      const provider = new FinnhubQuoteProvider({ apiKey: API_KEY, fetchFn: mockFetch });

      // Act
      await provider.getCurrentPrice('NASDAQ:AAPL');

      // Assert
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('symbol=AAPL');
      expect(calledUrl).not.toContain('NASDAQ');
    });

    test('TSE:6501 からシンボル 6501 を抽出してリクエストする', async () => {
      // Arrange
      const mockFetch = jest.fn().mockResolvedValue(createMockResponse(VALID_QUOTE_RESPONSE));
      const provider = new FinnhubQuoteProvider({ apiKey: API_KEY, fetchFn: mockFetch });

      // Act
      await provider.getCurrentPrice('TSE:6501');

      // Assert
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('symbol=6501');
    });
  });

  describe('その他のエラー', () => {
    test('fetch が非 AbortError をスローした場合はそのまま再スローする', async () => {
      // Arrange
      const networkError = new Error('ネットワークエラー');
      const mockFetch = jest.fn().mockRejectedValue(networkError);
      const provider = new FinnhubQuoteProvider({ apiKey: API_KEY, fetchFn: mockFetch });

      // Act & Assert
      await expect(provider.getCurrentPrice('NASDAQ:AAPL')).rejects.toThrow('ネットワークエラー');
    });
  });
});
