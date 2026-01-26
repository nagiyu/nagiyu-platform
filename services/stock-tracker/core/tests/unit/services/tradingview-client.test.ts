/**
 * TradingView API クライアント - Unit Test
 *
 * TradingView API の getCurrentPrice 関数のテスト
 * TradingView ライブラリをモック化してテストを実施
 */

import {
  getCurrentPrice,
  getChartData,
  TRADINGVIEW_ERROR_MESSAGES,
} from '../../../src/services/tradingview-client';

/**
 * TradingView ライブラリのモック
 *
 * WebSocket 接続をシミュレートするモックオブジェクト
 */
type MockChart = {
  setMarket: jest.Mock;
  onUpdate: jest.Mock;
  onError: jest.Mock;
  delete: jest.Mock;
  periods: Array<{
    time?: number;
    close?: number;
    open?: number;
    max?: number;
    min?: number;
    volume?: number;
  }>;
};

type MockSession = {
  Chart: jest.Mock<MockChart>;
};

type MockClient = {
  Session: MockSession;
  end: jest.Mock;
};

let mockChart: MockChart;
let mockClient: MockClient;
let onUpdateCallback: (() => void) | null = null;
let onErrorCallback: ((error: Error) => void) | null = null;

// TradingView ライブラリのモック
jest.mock('@mathieuc/tradingview', () => {
  return {
    Client: jest.fn().mockImplementation(() => mockClient),
  };
});

describe('TradingView Client', () => {
  beforeEach(() => {
    // モックオブジェクトの初期化
    onUpdateCallback = null;
    onErrorCallback = null;

    mockChart = {
      setMarket: jest.fn(),
      onUpdate: jest.fn((callback: () => void) => {
        onUpdateCallback = callback;
      }),
      onError: jest.fn((callback: (error: Error) => void) => {
        onErrorCallback = callback;
      }),
      delete: jest.fn(),
      periods: [],
    };

    mockClient = {
      Session: {
        Chart: jest.fn().mockReturnValue(mockChart),
      },
      end: jest.fn(),
    };
  });

  describe('getCurrentPrice', () => {
    describe('正常系', () => {
      test('現在価格を正しく取得できる', async () => {
        // Arrange: モックデータの設定
        const expectedPrice = 150.5;
        mockChart.periods = [{ close: expectedPrice }];

        // Act: getCurrentPrice を非同期で実行
        const pricePromise = getCurrentPrice('NSDQ:AAPL');

        // onUpdate コールバックを実行（WebSocket からのデータ受信をシミュレート）
        if (onUpdateCallback) {
          onUpdateCallback();
        }

        const actualPrice = await pricePromise;

        // Assert: 取得した価格が正しいか確認
        expect(actualPrice).toBe(expectedPrice);
        expect(mockChart.setMarket).toHaveBeenCalledWith('NSDQ:AAPL', {
          timeframe: '1',
          session: 'extended',
        });
        expect(mockChart.delete).toHaveBeenCalled();
        expect(mockClient.end).toHaveBeenCalled();
      });

      test('カスタムオプション（timeout, session）を使用して価格を取得できる', async () => {
        // Arrange
        const expectedPrice = 200.75;
        mockChart.periods = [{ close: expectedPrice }];

        // Act
        const pricePromise = getCurrentPrice('NYSE:TSLA', {
          timeout: 5000,
          session: 'regular',
        });

        if (onUpdateCallback) {
          onUpdateCallback();
        }

        const actualPrice = await pricePromise;

        // Assert
        expect(actualPrice).toBe(expectedPrice);
        expect(mockChart.setMarket).toHaveBeenCalledWith('NYSE:TSLA', {
          timeframe: '1',
          session: 'regular',
        });
      });

      test('リソース管理: chart.delete() と client.end() が必ず呼び出される', async () => {
        // Arrange
        mockChart.periods = [{ close: 100.0 }];

        // Act
        const pricePromise = getCurrentPrice('NSDQ:NVDA');

        if (onUpdateCallback) {
          onUpdateCallback();
        }

        await pricePromise;

        // Assert: リソースクリーンアップが呼ばれているか確認
        expect(mockChart.delete).toHaveBeenCalledTimes(1);
        expect(mockClient.end).toHaveBeenCalledTimes(1);
      });
    });

    describe('異常系: バリデーションエラー', () => {
      test('無効なティッカーID（空文字列）でエラーをスローする', async () => {
        // Act & Assert
        await expect(getCurrentPrice('')).rejects.toThrow(
          TRADINGVIEW_ERROR_MESSAGES.INVALID_TICKER
        );
      });

      test('無効なティッカーID（コロンなし）でエラーをスローする', async () => {
        // Act & Assert
        await expect(getCurrentPrice('AAPL')).rejects.toThrow(
          TRADINGVIEW_ERROR_MESSAGES.INVALID_TICKER
        );
      });

      test('無効なティッカーID（数値型）でエラーをスローする', async () => {
        // Act & Assert
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await expect(getCurrentPrice(123 as any)).rejects.toThrow(
          TRADINGVIEW_ERROR_MESSAGES.INVALID_TICKER
        );
      });
    });

    describe('異常系: タイムアウト', () => {
      test('タイムアウト時にエラーをスローする', async () => {
        // Arrange: onUpdateCallback を呼び出さない（タイムアウトをシミュレート）
        const timeout = 100; // 短いタイムアウト時間を設定

        // Act & Assert
        await expect(getCurrentPrice('NSDQ:AAPL', { timeout })).rejects.toThrow(
          TRADINGVIEW_ERROR_MESSAGES.TIMEOUT
        );

        // リソース管理が実行されたか確認
        expect(mockChart.delete).toHaveBeenCalled();
        expect(mockClient.end).toHaveBeenCalled();
      });

      test('タイムアウト後にリソースが適切にクリーンアップされる', async () => {
        // Arrange
        const timeout = 100;

        // Act
        try {
          await getCurrentPrice('NYSE:AAPL', { timeout });
        } catch {
          // タイムアウトエラーを無視
        }

        // Assert: エラー時もリソースクリーンアップが呼ばれる
        expect(mockChart.delete).toHaveBeenCalledTimes(1);
        expect(mockClient.end).toHaveBeenCalledTimes(1);
      });
    });

    describe('異常系: 接続エラー', () => {
      test('TradingView API の接続エラーでエラーをスローする', async () => {
        // Arrange
        const errorMessage = 'Connection failed';

        // Act
        const pricePromise = getCurrentPrice('NSDQ:AAPL');

        // onErrorCallback を実行（接続エラーをシミュレート）
        if (onErrorCallback) {
          onErrorCallback(new Error(errorMessage));
        }

        // Assert
        await expect(pricePromise).rejects.toThrow(
          `${TRADINGVIEW_ERROR_MESSAGES.CONNECTION_ERROR}: ${errorMessage}`
        );

        // リソース管理が実行されたか確認
        expect(mockChart.delete).toHaveBeenCalled();
        expect(mockClient.end).toHaveBeenCalled();
      });

      test('レート制限エラーでエラーをスローする', async () => {
        // Arrange: レート制限のエラーメッセージをシミュレート
        const errorMessage = 'rate limit exceeded';

        // Act
        const pricePromise = getCurrentPrice('NYSE:TSLA');

        if (onErrorCallback) {
          onErrorCallback(new Error(errorMessage));
        }

        // Assert
        await expect(pricePromise).rejects.toThrow(TRADINGVIEW_ERROR_MESSAGES.RATE_LIMIT);

        // リソース管理が実行されたか確認
        expect(mockChart.delete).toHaveBeenCalled();
        expect(mockClient.end).toHaveBeenCalled();
      });
    });

    describe('異常系: データ取得失敗', () => {
      test('periods が空配列の場合、タイムアウトまで待機する', async () => {
        // Arrange: periods が空配列（データなし）
        mockChart.periods = [];
        const timeout = 100;

        // Act
        const pricePromise = getCurrentPrice('NSDQ:AAPL', { timeout });

        // onUpdate を呼び出してもデータがないため、タイムアウトする
        if (onUpdateCallback) {
          onUpdateCallback();
        }

        // Assert
        await expect(pricePromise).rejects.toThrow(TRADINGVIEW_ERROR_MESSAGES.TIMEOUT);
      });

      test('periods[0].close が undefined の場合、タイムアウトまで待機する', async () => {
        // Arrange
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockChart.periods = [{ close: undefined as any }];
        const timeout = 100;

        // Act
        const pricePromise = getCurrentPrice('NYSE:AAPL', { timeout });

        if (onUpdateCallback) {
          onUpdateCallback();
        }

        // Assert
        await expect(pricePromise).rejects.toThrow(TRADINGVIEW_ERROR_MESSAGES.TIMEOUT);
      });

      test('periods[0].close が null の場合、タイムアウトまで待機する', async () => {
        // Arrange
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockChart.periods = [{ close: null as any }];
        const timeout = 100;

        // Act
        const pricePromise = getCurrentPrice('NSDQ:NVDA', { timeout });

        if (onUpdateCallback) {
          onUpdateCallback();
        }

        // Assert
        await expect(pricePromise).rejects.toThrow(TRADINGVIEW_ERROR_MESSAGES.TIMEOUT);
      });
    });

    describe('エッジケース', () => {
      test('chart.delete() がエラーをスローしても、client.end() は実行される', async () => {
        // Arrange
        mockChart.periods = [{ close: 100.0 }];
        mockChart.delete.mockImplementation(() => {
          throw new Error('delete error');
        });

        // Act
        const pricePromise = getCurrentPrice('NSDQ:AAPL');

        if (onUpdateCallback) {
          onUpdateCallback();
        }

        await pricePromise;

        // Assert: delete でエラーが発生しても、end は呼ばれる
        expect(mockChart.delete).toHaveBeenCalled();
        expect(mockClient.end).toHaveBeenCalled();
      });

      test('client.end() がエラーをスローしても、処理は正常に完了する', async () => {
        // Arrange
        mockChart.periods = [{ close: 150.0 }];
        mockClient.end.mockImplementation(() => {
          throw new Error('end error');
        });

        // Act
        const pricePromise = getCurrentPrice('NYSE:TSLA');

        if (onUpdateCallback) {
          onUpdateCallback();
        }

        const actualPrice = await pricePromise;

        // Assert: end でエラーが発生しても、価格は正しく取得される
        expect(actualPrice).toBe(150.0);
        expect(mockClient.end).toHaveBeenCalled();
      });

      test('複数の onUpdate イベントが発生しても、最初の有効なデータのみを返す', async () => {
        // Arrange
        const firstPrice = 100.0;
        const secondPrice = 200.0;
        mockChart.periods = [{ close: firstPrice }];

        // Act
        const pricePromise = getCurrentPrice('NSDQ:AAPL');

        // 1回目の onUpdate: 有効なデータ
        if (onUpdateCallback) {
          onUpdateCallback();
        }

        // 2回目の onUpdate: データを変更
        mockChart.periods = [{ close: secondPrice }];
        if (onUpdateCallback) {
          onUpdateCallback();
        }

        const actualPrice = await pricePromise;

        // Assert: 最初のデータのみが返される
        expect(actualPrice).toBe(firstPrice);
      });
    });
  });

  describe('getChartData', () => {
    describe('正常系', () => {
      test('チャートデータを正しく取得できる（時間がミリ秒に変換される）', async () => {
        // Arrange: モックデータの設定（時間は秒単位）
        const mockTimeInSeconds = 1640000000; // 2021-12-20 12:26:40 UTC
        const expectedTimeInMilliseconds = mockTimeInSeconds * 1000;

        mockChart.periods = [
          {
            time: mockTimeInSeconds,
            open: 100.0,
            max: 110.0,
            min: 95.0,
            close: 105.0,
            volume: 1000000,
          },
        ];

        // Act: getChartData を非同期で実行
        const chartDataPromise = getChartData('NSDQ:AAPL', '60', { count: 10 });

        // onUpdate コールバックを実行
        if (onUpdateCallback) {
          onUpdateCallback();
        }

        const chartData = await chartDataPromise;

        // Assert: チャートデータが正しく取得され、時間がミリ秒に変換されているか確認
        expect(chartData).toHaveLength(1);
        expect(chartData[0]).toEqual({
          time: expectedTimeInMilliseconds, // ミリ秒に変換されているべき
          open: 100.0,
          high: 110.0,
          low: 95.0,
          close: 105.0,
          volume: 1000000,
        });
        expect(mockChart.setMarket).toHaveBeenCalledWith('NSDQ:AAPL', {
          timeframe: '60',
          session: 'extended',
        });
        expect(mockChart.delete).toHaveBeenCalled();
        expect(mockClient.end).toHaveBeenCalled();
      });

      test('複数のチャートデータを正しく取得できる', async () => {
        // Arrange
        const baseTime = 1640000000;
        mockChart.periods = [
          {
            time: baseTime,
            open: 100.0,
            max: 110.0,
            min: 95.0,
            close: 105.0,
            volume: 1000000,
          },
          {
            time: baseTime - 3600, // 1時間前
            open: 95.0,
            max: 105.0,
            min: 90.0,
            close: 100.0,
            volume: 900000,
          },
        ];

        // Act
        const chartDataPromise = getChartData('NYSE:TSLA', 'D', { count: 2 });

        if (onUpdateCallback) {
          onUpdateCallback();
        }

        const chartData = await chartDataPromise;

        // Assert
        expect(chartData).toHaveLength(2);
        expect(chartData[0].time).toBe(baseTime * 1000);
        expect(chartData[1].time).toBe((baseTime - 3600) * 1000);
      });
    });

    describe('異常系: バリデーションエラー', () => {
      test('無効なティッカーID（空文字）でエラーをスローする', async () => {
        // Act & Assert
        await expect(getChartData('', '1')).rejects.toThrow(
          TRADINGVIEW_ERROR_MESSAGES.INVALID_TICKER
        );
      });

      test('無効なティッカーID（コロンなし）でエラーをスローする', async () => {
        // Act & Assert
        await expect(getChartData('AAPL', '1')).rejects.toThrow(
          TRADINGVIEW_ERROR_MESSAGES.INVALID_TICKER
        );
      });

      test('無効なタイムフレームでエラーをスローする', async () => {
        // Act & Assert
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await expect(getChartData('NSDQ:AAPL', '30' as any)).rejects.toThrow(
          TRADINGVIEW_ERROR_MESSAGES.INVALID_TIMEFRAME
        );
      });
    });

    describe('異常系: タイムアウト', () => {
      test('タイムアウト時にエラーをスローする', async () => {
        // Arrange: タイムアウトを短く設定し、onUpdateを呼ばない

        // Act & Assert
        await expect(getChartData('NSDQ:AAPL', '1', { timeout: 100 })).rejects.toThrow(
          TRADINGVIEW_ERROR_MESSAGES.TIMEOUT
        );

        // リソースクリーンアップが呼ばれることを確認
        expect(mockChart.delete).toHaveBeenCalled();
        expect(mockClient.end).toHaveBeenCalled();
      });
    });

    describe('異常系: エラーハンドリング', () => {
      test('レート制限エラーをスローする', async () => {
        // Arrange
        const rateError = new Error('rate limit exceeded');

        // Act
        const chartDataPromise = getChartData('NSDQ:AAPL', '1');

        // Trigger onError callback
        if (onErrorCallback) {
          onErrorCallback(rateError);
        }

        // Assert
        await expect(chartDataPromise).rejects.toThrow(TRADINGVIEW_ERROR_MESSAGES.RATE_LIMIT);

        // リソースクリーンアップが呼ばれることを確認
        expect(mockChart.delete).toHaveBeenCalled();
        expect(mockClient.end).toHaveBeenCalled();
      });

      test('その他の接続エラーをスローする', async () => {
        // Arrange
        const connectionError = new Error('Connection failed');

        // Act
        const chartDataPromise = getChartData('NSDQ:AAPL', '1');

        // Trigger onError callback
        if (onErrorCallback) {
          onErrorCallback(connectionError);
        }

        // Assert
        await expect(chartDataPromise).rejects.toThrow(
          `${TRADINGVIEW_ERROR_MESSAGES.CONNECTION_ERROR}: Connection failed`
        );
      });
    });

    describe('リソースクリーンアップのエラー処理', () => {
      test('chart.delete()でエラーが発生しても処理を継続', async () => {
        // Arrange
        mockChart.delete.mockImplementationOnce(() => {
          throw new Error('Delete error');
        });
        mockChart.periods = [
          {
            time: 1640000000,
            open: 100.0,
            max: 110.0,
            min: 95.0,
            close: 105.0,
            volume: 1000000,
          },
        ];

        // Spy on console.debug
        const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();

        // Act
        const chartDataPromise = getChartData('NSDQ:AAPL', '1');

        if (onUpdateCallback) {
          onUpdateCallback();
        }

        const chartData = await chartDataPromise;

        // Assert: データは正常に取得される
        expect(chartData).toHaveLength(1);
        expect(consoleDebugSpy).toHaveBeenCalledWith(
          'Error deleting chart (might be already deleted):',
          expect.any(Error)
        );

        consoleDebugSpy.mockRestore();
      });

      test('client.end()でエラーが発生しても処理を継続', async () => {
        // Arrange
        mockClient.end.mockImplementationOnce(() => {
          throw new Error('End error');
        });
        mockChart.periods = [
          {
            time: 1640000000,
            open: 100.0,
            max: 110.0,
            min: 95.0,
            close: 105.0,
            volume: 1000000,
          },
        ];

        // Spy on console.debug
        const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();

        // Act
        const chartDataPromise = getChartData('NSDQ:AAPL', '1');

        if (onUpdateCallback) {
          onUpdateCallback();
        }

        const chartData = await chartDataPromise;

        // Assert: データは正常に取得される
        expect(chartData).toHaveLength(1);
        expect(consoleDebugSpy).toHaveBeenCalledWith(
          'Error ending client (might be already ended):',
          expect.any(Error)
        );

        consoleDebugSpy.mockRestore();
      });
    });
  });
});
