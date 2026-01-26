/**
 * Ticker Repository Unit Tests
 *
 * TickerRepositoryの全メソッドをテスト
 * - 正常系: 各メソッドの期待される動作
 * - 異常系: エラーハンドリング
 * - TickerID自動生成ロジックのテスト
 * - GSI3クエリのテスト
 */

import { TickerRepository } from '../../../src/repositories/ticker.js';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Ticker } from '../../../src/types.js';

describe('TickerRepository', () => {
  let repository: TickerRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const tableName = 'test-table';

  beforeEach(() => {
    // DynamoDBDocumentClient のモック
    mockDocClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<DynamoDBDocumentClient>;

    repository = new TickerRepository(mockDocClient, tableName);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAll', () => {
    it('全ティッカーを取得できる（exchangeId指定なし）', async () => {
      const mockItems = [
        {
          PK: 'TICKER#NSDQ:AAPL',
          SK: 'METADATA',
          Type: 'Ticker',
          TickerID: 'NSDQ:AAPL',
          Symbol: 'AAPL',
          Name: 'Apple Inc.',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1700000000000,
          UpdatedAt: 1700000000000,
        },
        {
          PK: 'TICKER#NYSE:TSLA',
          SK: 'METADATA',
          Type: 'Ticker',
          TickerID: 'NYSE:TSLA',
          Symbol: 'TSLA',
          Name: 'Tesla, Inc.',
          ExchangeID: 'NYSE',
          CreatedAt: 1700000000000,
          UpdatedAt: 1700000000000,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockItems,
        $metadata: {},
      });

      const result = await repository.getAll();

      expect(result).toHaveLength(2);
      expect(result[0].TickerID).toBe('NSDQ:AAPL');
      expect(result[1].TickerID).toBe('NYSE:TSLA');
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('全ティッカーを取得できる（exchangeId指定あり）', async () => {
      const mockItems = [
        {
          PK: 'TICKER#NSDQ:AAPL',
          SK: 'METADATA',
          Type: 'Ticker',
          TickerID: 'NSDQ:AAPL',
          Symbol: 'AAPL',
          Name: 'Apple Inc.',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1700000000000,
          UpdatedAt: 1700000000000,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockItems,
        $metadata: {},
      });

      const result = await repository.getAll('NASDAQ');

      expect(result).toHaveLength(1);
      expect(result[0].TickerID).toBe('NSDQ:AAPL');
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      // exchangeId指定時はGSI3を使用
    });

    it('ティッカーが存在しない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [],
        $metadata: {},
      });

      const result = await repository.getAll();

      expect(result).toEqual([]);
    });

    it('Items が undefined の場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      const result = await repository.getAll();

      expect(result).toEqual([]);
    });

    it('データベースエラーが発生した場合はエラーをスロー', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(repository.getAll()).rejects.toThrow(
        'データベースエラーが発生しました: DynamoDB error'
      );
    });
  });

  describe('getById', () => {
    it('ティッカーIDでティッカーを取得できる', async () => {
      const mockItem = {
        PK: 'TICKER#NSDQ:AAPL',
        SK: 'METADATA',
        Type: 'Ticker',
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1700000000000,
        UpdatedAt: 1700000000000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Item: mockItem,
        $metadata: {},
      });

      const result = await repository.getById('NSDQ:AAPL');

      expect(result.TickerID).toBe('NSDQ:AAPL');
      expect(result.Symbol).toBe('AAPL');
      expect(result.Name).toBe('Apple Inc.');
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('ティッカーが存在しない場合はエラーをスロー', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      await expect(repository.getById('NONEXISTENT')).rejects.toThrow('ティッカーが見つかりません');
    });

    it('データベースエラーが発生した場合はエラーをスロー', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(repository.getById('NSDQ:AAPL')).rejects.toThrow(
        'データベースエラーが発生しました: DynamoDB error'
      );
    });
  });

  describe('getByExchange', () => {
    it('取引所ごとのティッカーを取得できる（GSI3使用）', async () => {
      const mockItems = [
        {
          PK: 'TICKER#NSDQ:AAPL',
          SK: 'METADATA',
          Type: 'Ticker',
          TickerID: 'NSDQ:AAPL',
          Symbol: 'AAPL',
          Name: 'Apple Inc.',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1700000000000,
          UpdatedAt: 1700000000000,
        },
        {
          PK: 'TICKER#NSDQ:NVDA',
          SK: 'METADATA',
          Type: 'Ticker',
          TickerID: 'NSDQ:NVDA',
          Symbol: 'NVDA',
          Name: 'NVIDIA Corporation',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1700000000000,
          UpdatedAt: 1700000000000,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockItems,
        $metadata: {},
      });

      const result = await repository.getByExchange('NASDAQ');

      expect(result).toHaveLength(2);
      expect(result[0].TickerID).toBe('NSDQ:AAPL');
      expect(result[1].TickerID).toBe('NSDQ:NVDA');
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('該当する取引所のティッカーが存在しない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [],
        $metadata: {},
      });

      const result = await repository.getByExchange('NONEXISTENT');

      expect(result).toEqual([]);
    });

    it('データベースエラーが発生した場合はエラーをスロー', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(repository.getByExchange('NASDAQ')).rejects.toThrow(
        'データベースエラーが発生しました: DynamoDB error'
      );
    });
  });

  describe('create', () => {
    const newTicker: Omit<Ticker, 'TickerID' | 'CreatedAt' | 'UpdatedAt'> = {
      Symbol: 'AAPL',
      Name: 'Apple Inc.',
      ExchangeID: 'NASDAQ',
    };

    it('ティッカーを作成できる（TickerID自動生成）', async () => {
      // 既存チェックで404を返す
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      // 作成成功
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      const result = await repository.create(newTicker, 'NSDQ');

      expect(result.TickerID).toBe('NSDQ:AAPL');
      expect(result.Symbol).toBe('AAPL');
      expect(result.Name).toBe('Apple Inc.');
      expect(result.ExchangeID).toBe('NASDAQ');
      expect(result.CreatedAt).toBeGreaterThan(0);
      expect(result.UpdatedAt).toBeGreaterThan(0);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
    });

    it('TickerIDが正しい形式で生成される（{Exchange.Key}:{Symbol}）', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      const result = await repository.create(newTicker, 'NYSE');

      expect(result.TickerID).toBe('NYSE:AAPL');
    });

    it('ティッカーが既に存在する場合はエラーをスロー', async () => {
      // 既存チェックでティッカーが見つかる
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          TickerID: 'NSDQ:AAPL',
          Symbol: 'AAPL',
          Name: 'Apple Inc.',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1700000000000,
          UpdatedAt: 1700000000000,
        },
        $metadata: {},
      });

      await expect(repository.create(newTicker, 'NSDQ')).rejects.toThrow(
        'ティッカーは既に存在します'
      );
    });

    it('データベースエラーが発生した場合はエラーをスロー', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      mockDocClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(repository.create(newTicker, 'NSDQ')).rejects.toThrow(
        'データベースエラーが発生しました: DynamoDB error'
      );
    });
  });

  describe('update', () => {
    it('ティッカーを更新できる（Symbol更新）', async () => {
      const mockExistingTicker = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1700000000000,
        UpdatedAt: 1700000000000,
      };

      // 存在チェック
      mockDocClient.send.mockResolvedValueOnce({
        Item: mockExistingTicker,
        $metadata: {},
      });

      // 更新実行
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      // 更新後の取得
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          ...mockExistingTicker,
          Symbol: 'AAPL2',
          UpdatedAt: 1700000001000,
        },
        $metadata: {},
      });

      const result = await repository.update('NSDQ:AAPL', { Symbol: 'AAPL2' });

      expect(result.Symbol).toBe('AAPL2');
      expect(mockDocClient.send).toHaveBeenCalledTimes(3);
    });

    it('ティッカーを更新できる（Name更新）', async () => {
      const mockExistingTicker = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1700000000000,
        UpdatedAt: 1700000000000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Item: mockExistingTicker,
        $metadata: {},
      });

      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          ...mockExistingTicker,
          Name: 'Apple Corporation',
          UpdatedAt: 1700000001000,
        },
        $metadata: {},
      });

      const result = await repository.update('NSDQ:AAPL', {
        Name: 'Apple Corporation',
      });

      expect(result.Name).toBe('Apple Corporation');
    });

    it('ティッカーを更新できる（Symbol と Name 両方更新）', async () => {
      const mockExistingTicker = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1700000000000,
        UpdatedAt: 1700000000000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Item: mockExistingTicker,
        $metadata: {},
      });

      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          ...mockExistingTicker,
          Symbol: 'AAPL2',
          Name: 'Apple Corporation',
          UpdatedAt: 1700000001000,
        },
        $metadata: {},
      });

      const result = await repository.update('NSDQ:AAPL', {
        Symbol: 'AAPL2',
        Name: 'Apple Corporation',
      });

      expect(result.Symbol).toBe('AAPL2');
      expect(result.Name).toBe('Apple Corporation');
    });

    it('ティッカーが存在しない場合はエラーをスロー', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      await expect(repository.update('NONEXISTENT', { Name: 'New Name' })).rejects.toThrow(
        'ティッカーが見つかりません'
      );
    });

    it('データベースエラーが発生した場合はエラーをスロー', async () => {
      // Return complete valid ticker data on first call (getById check)
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'TICKER#NSDQ:AAPL',
          SK: 'METADATA',
          Type: 'Ticker',
          TickerID: 'NSDQ:AAPL',
          Symbol: 'AAPL',
          Name: 'Apple Inc.',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1700000000000,
          UpdatedAt: 1700000000000,
        },
        $metadata: {},
      });

      mockDocClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(repository.update('NSDQ:AAPL', { Name: 'New Name' })).rejects.toThrow(
        'データベースエラーが発生しました: DynamoDB error'
      );
    });
  });

  describe('delete', () => {
    it('ティッカーを削除できる', async () => {
      const mockExistingTicker = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1700000000000,
        UpdatedAt: 1700000000000,
      };

      // 存在チェック
      mockDocClient.send.mockResolvedValueOnce({
        Item: mockExistingTicker,
        $metadata: {},
      });

      // 削除実行
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      await repository.delete('NSDQ:AAPL');

      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
    });

    it('ティッカーが存在しない場合はエラーをスロー', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      await expect(repository.delete('NONEXISTENT')).rejects.toThrow('ティッカーが見つかりません');
    });

    it('データベースエラーが発生した場合はエラーをスロー', async () => {
      // Return complete valid ticker data on first call (getById check)
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'TICKER#NSDQ:AAPL',
          SK: 'METADATA',
          Type: 'Ticker',
          TickerID: 'NSDQ:AAPL',
          Symbol: 'AAPL',
          Name: 'Apple Inc.',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1700000000000,
          UpdatedAt: 1700000000000,
        },
        $metadata: {},
      });

      mockDocClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(repository.delete('NSDQ:AAPL')).rejects.toThrow(
        'データベースエラーが発生しました: DynamoDB error'
      );
    });
  });

  describe('Method overloads and error handling', () => {
    describe('getById with object key', () => {
      it('基底クラスのシグネチャ（オブジェクトキー）で取得できる', async () => {
        const mockItem = {
          PK: 'TICKER#NSDQ:AAPL',
          SK: 'METADATA',
          Type: 'Ticker',
          TickerID: 'NSDQ:AAPL',
          Symbol: 'AAPL',
          Name: 'Apple Inc.',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1700000000000,
          UpdatedAt: 1700000000000,
        };

        mockDocClient.send.mockResolvedValueOnce({
          Item: mockItem,
          $metadata: {},
        });

        const result = await repository.getById({ tickerId: 'NSDQ:AAPL' });

        expect(result).not.toBeNull();
        expect(result?.TickerID).toBe('NSDQ:AAPL');
      });

      it('存在しない場合はnullを返す（文字列版と異なる動作）', async () => {
        mockDocClient.send.mockResolvedValueOnce({
          $metadata: {},
        });

        const result = await repository.getById({ tickerId: 'NONEXISTENT' });

        expect(result).toBeNull();
      });
    });

    describe('create with TickerID', () => {
      it('TickerID付きエンティティを作成できる', async () => {
        const newTicker = {
          TickerID: 'TEST:NEW',
          Symbol: 'NEW',
          Name: 'New Ticker',
          ExchangeID: 'TEST',
        };

        // 既存チェックで404を返す
        mockDocClient.send.mockResolvedValueOnce({
          $metadata: {},
        });

        // 作成成功
        mockDocClient.send.mockResolvedValueOnce({
          $metadata: {},
        });

        const result = await repository.create(newTicker);

        expect(result.TickerID).toBe('TEST:NEW');
        expect(mockDocClient.send).toHaveBeenCalledTimes(2);
      });

      it('exchangeKeyが指定されていない場合はエラー', async () => {
        const newTicker = {
          Symbol: 'AAPL',
          Name: 'Apple Inc.',
          ExchangeID: 'NASDAQ',
        };

        await expect(
          // @ts-expect-error - Testing runtime error when exchangeKey is missing
          repository.create(newTicker)
        ).rejects.toThrow('exchangeKey is required when TickerID is not provided');
      });
    });

    describe('update with object key', () => {
      it('基底クラスのシグネチャ（オブジェクトキー）で更新できる', async () => {
        const mockExistingTicker = {
          TickerID: 'NSDQ:AAPL',
          Symbol: 'AAPL',
          Name: 'Apple Inc.',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1700000000000,
          UpdatedAt: 1700000000000,
        };

        // 存在チェック
        mockDocClient.send.mockResolvedValueOnce({
          Item: mockExistingTicker,
          $metadata: {},
        });

        // 更新実行
        mockDocClient.send.mockResolvedValueOnce({
          $metadata: {},
        });

        // 更新後の取得
        mockDocClient.send.mockResolvedValueOnce({
          Item: {
            ...mockExistingTicker,
            Name: 'Apple Corporation',
            UpdatedAt: 1700000001000,
          },
          $metadata: {},
        });

        const result = await repository.update(
          { tickerId: 'NSDQ:AAPL' },
          { Name: 'Apple Corporation' }
        );

        expect(result.Name).toBe('Apple Corporation');
      });
    });

    describe('delete with object key', () => {
      it('基底クラスのシグネチャ（オブジェクトキー）で削除できる', async () => {
        const mockExistingTicker = {
          TickerID: 'NSDQ:AAPL',
          Symbol: 'AAPL',
          Name: 'Apple Inc.',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1700000000000,
          UpdatedAt: 1700000000000,
        };

        // 存在チェック
        mockDocClient.send.mockResolvedValueOnce({
          Item: mockExistingTicker,
          $metadata: {},
        });

        // 削除実行
        mockDocClient.send.mockResolvedValueOnce({
          $metadata: {},
        });

        await repository.delete({ tickerId: 'NSDQ:AAPL' });

        expect(mockDocClient.send).toHaveBeenCalledTimes(2);
      });
    });

    describe('InvalidEntityDataError handling', () => {
      it('getAll: マッピング時のInvalidEntityDataErrorをInvalidTickerDataErrorに変換', async () => {
        const mockItems = [
          {
            PK: 'TICKER#NSDQ:AAPL',
            SK: 'METADATA',
            Type: 'Ticker',
            TickerID: 'NSDQ:AAPL',
            Symbol: 'AAPL',
            Name: 'Apple Inc.',
            ExchangeID: 'NASDAQ',
            // CreatedAt missing - will cause InvalidEntityDataError
            UpdatedAt: 1700000000000,
          },
        ];

        mockDocClient.send.mockResolvedValueOnce({
          Items: mockItems,
          $metadata: {},
        });

        await expect(repository.getAll()).rejects.toThrow('CreatedAt');
      });

      it('getById: マッピング時のInvalidEntityDataErrorをInvalidTickerDataErrorに変換', async () => {
        const mockItem = {
          PK: 'TICKER#NSDQ:AAPL',
          SK: 'METADATA',
          Type: 'Ticker',
          TickerID: 'NSDQ:AAPL',
          Symbol: 'AAPL',
          Name: 'Apple Inc.',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1700000000000,
          // UpdatedAt missing
        };

        mockDocClient.send.mockResolvedValueOnce({
          Item: mockItem,
          $metadata: {},
        });

        await expect(repository.getById('NSDQ:AAPL')).rejects.toThrow('UpdatedAt');
      });

      it('getByExchange: マッピング時のInvalidEntityDataErrorをInvalidTickerDataErrorに変換', async () => {
        const mockItems = [
          {
            PK: 'TICKER#NSDQ:AAPL',
            SK: 'METADATA',
            Type: 'Ticker',
            TickerID: 'NSDQ:AAPL',
            Symbol: 123, // Invalid type - should be string
            Name: 'Apple Inc.',
            ExchangeID: 'NASDAQ',
            CreatedAt: 1700000000000,
            UpdatedAt: 1700000000000,
          },
        ];

        mockDocClient.send.mockResolvedValueOnce({
          Items: mockItems,
          $metadata: {},
        });

        await expect(repository.getByExchange('NASDAQ')).rejects.toThrow('Symbol');
      });
    });

    describe('Additional error branches', () => {
      it('create: EntityNotFoundError以外のエラーが発生した場合は再スロー', async () => {
        // 既存チェックでカスタムエラーを投げる
        mockDocClient.send.mockRejectedValueOnce(new Error('Custom error'));

        const newTicker = {
          Symbol: 'AAPL',
          Name: 'Apple Inc.',
          ExchangeID: 'NASDAQ',
        };

        await expect(repository.create(newTicker, 'NSDQ')).rejects.toThrow('Custom error');
      });

      it('getById: 文字列版で非TickerNotFoundErrorのエラーが発生', async () => {
        mockDocClient.send.mockRejectedValueOnce(new Error('Network error'));

        await expect(repository.getById('NSDQ:AAPL')).rejects.toThrow(
          'データベースエラーが発生しました: Network error'
        );
      });

      it('update: 文字列版でEntityNotFoundErrorが発生', async () => {
        mockDocClient.send.mockResolvedValueOnce({
          $metadata: {},
        });

        await expect(repository.update('NONEXISTENT', { Name: 'Test' })).rejects.toThrow(
          'ティッカーが見つかりません'
        );
      });

      it('delete: 文字列版でEntityNotFoundErrorが発生', async () => {
        mockDocClient.send.mockResolvedValueOnce({
          $metadata: {},
        });

        await expect(repository.delete('NONEXISTENT')).rejects.toThrow(
          'ティッカーが見つかりません'
        );
      });
    });
  });
});
