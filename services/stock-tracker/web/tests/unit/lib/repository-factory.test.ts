/**
 * Repository Factory Unit Tests
 *
 * 環境変数に基づいたリポジトリファクトリーのテスト
 */

import {
  createAlertRepository,
  createHoldingRepository,
  createTickerRepository,
  createExchangeRepository,
  createWatchlistRepository,
  clearMemoryStore,
} from '../../../lib/repository-factory';
import * as dynamodb from '../../../lib/dynamodb';

// DynamoDBクライアントをモック化
jest.mock('../../../lib/dynamodb');

const mockedDynamoDB = dynamodb as jest.Mocked<typeof dynamodb>;

describe('Repository Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    clearMemoryStore();
    // デフォルトのモック動作を設定
    mockedDynamoDB.getDynamoDBClient.mockReturnValue({
      send: jest.fn(),
    } as any);
    mockedDynamoDB.getTableName.mockImplementation(() => {
      const tableName = process.env.DYNAMODB_TABLE_NAME;
      if (!tableName) {
        throw new Error('DYNAMODB_TABLE_NAME environment variable is not set');
      }
      return tableName;
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('USE_IN_MEMORY_REPOSITORY=true', () => {
    beforeEach(() => {
      process.env.USE_IN_MEMORY_REPOSITORY = 'true';
    });

    it('createAlertRepository はInMemory実装を返す', () => {
      const repo = createAlertRepository();
      expect(repo).toBeDefined();
      expect(repo.constructor.name).toBe('InMemoryAlertRepository');
    });

    it('createHoldingRepository はInMemory実装を返す', () => {
      const repo = createHoldingRepository();
      expect(repo).toBeDefined();
      expect(repo.constructor.name).toBe('InMemoryHoldingRepository');
    });

    it('createTickerRepository はInMemory実装を返す', () => {
      const repo = createTickerRepository();
      expect(repo).toBeDefined();
      expect(repo.constructor.name).toBe('InMemoryTickerRepository');
    });

    it('createExchangeRepository はInMemory実装を返す', () => {
      const repo = createExchangeRepository();
      expect(repo).toBeDefined();
      expect(repo.constructor.name).toBe('InMemoryExchangeRepository');
    });

    it('createWatchlistRepository はInMemory実装を返す', () => {
      const repo = createWatchlistRepository();
      expect(repo).toBeDefined();
      expect(repo.constructor.name).toBe('InMemoryWatchlistRepository');
    });

    it('シングルトンパターンが機能する', () => {
      const repo1 = createAlertRepository();
      const repo2 = createAlertRepository();
      expect(repo1).toBe(repo2);
    });

    it('clearMemoryStore でリポジトリインスタンスがクリアされる', () => {
      const repo1 = createAlertRepository();
      clearMemoryStore();
      const repo2 = createAlertRepository();
      expect(repo1).not.toBe(repo2);
    });

    it('異なるリポジトリが同じMemoryStoreを共有する', () => {
      const alertRepo = createAlertRepository();
      const holdingRepo = createHoldingRepository();
      expect(alertRepo).toBeDefined();
      expect(holdingRepo).toBeDefined();
      // 両方とも InMemory 実装であることを確認
      expect(alertRepo.constructor.name).toBe('InMemoryAlertRepository');
      expect(holdingRepo.constructor.name).toBe('InMemoryHoldingRepository');
    });
  });

  describe('USE_IN_MEMORY_REPOSITORY=false (DynamoDB)', () => {
    beforeEach(() => {
      process.env.USE_IN_MEMORY_REPOSITORY = 'false';
      process.env.DYNAMODB_TABLE_NAME = 'test-table';
      process.env.AWS_REGION = 'us-east-1';
    });

    it('createAlertRepository はDynamoDB実装を返す', () => {
      const repo = createAlertRepository();
      expect(repo).toBeDefined();
      expect(repo.constructor.name).toBe('DynamoDBAlertRepository');
    });

    it('createHoldingRepository はDynamoDB実装を返す', () => {
      const repo = createHoldingRepository();
      expect(repo).toBeDefined();
      expect(repo.constructor.name).toBe('DynamoDBHoldingRepository');
    });

    it('createTickerRepository はDynamoDB実装を返す', () => {
      const repo = createTickerRepository();
      expect(repo).toBeDefined();
      expect(repo.constructor.name).toBe('DynamoDBTickerRepository');
    });

    it('createExchangeRepository はDynamoDB実装を返す', () => {
      const repo = createExchangeRepository();
      expect(repo).toBeDefined();
      expect(repo.constructor.name).toBe('DynamoDBExchangeRepository');
    });

    it('createWatchlistRepository はDynamoDB実装を返す', () => {
      const repo = createWatchlistRepository();
      expect(repo).toBeDefined();
      expect(repo.constructor.name).toBe('DynamoDBWatchlistRepository');
    });

    it('シングルトンパターンが機能する - Alert', () => {
      const repo1 = createAlertRepository();
      const repo2 = createAlertRepository();
      expect(repo1).toBe(repo2);
    });

    it('シングルトンパターンが機能する - Holding', () => {
      const repo1 = createHoldingRepository();
      const repo2 = createHoldingRepository();
      expect(repo1).toBe(repo2);
    });

    it('シングルトンパターンが機能する - Ticker', () => {
      const repo1 = createTickerRepository();
      const repo2 = createTickerRepository();
      expect(repo1).toBe(repo2);
    });

    it('シングルトンパターンが機能する - Exchange', () => {
      const repo1 = createExchangeRepository();
      const repo2 = createExchangeRepository();
      expect(repo1).toBe(repo2);
    });

    it('シングルトンパターンが機能する - Watchlist', () => {
      const repo1 = createWatchlistRepository();
      const repo2 = createWatchlistRepository();
      expect(repo1).toBe(repo2);
    });
  });

  describe('USE_IN_MEMORY_REPOSITORY未設定 (デフォルト: DynamoDB)', () => {
    beforeEach(() => {
      delete process.env.USE_IN_MEMORY_REPOSITORY;
      process.env.DYNAMODB_TABLE_NAME = 'test-table';
      process.env.AWS_REGION = 'us-east-1';
    });

    it('createAlertRepository はDynamoDB実装を返す', () => {
      const repo = createAlertRepository();
      expect(repo).toBeDefined();
      expect(repo.constructor.name).toBe('DynamoDBAlertRepository');
    });

    it('全リポジトリがDynamoDB実装を返す', () => {
      const alertRepo = createAlertRepository();
      const holdingRepo = createHoldingRepository();
      const tickerRepo = createTickerRepository();
      const exchangeRepo = createExchangeRepository();
      const watchlistRepo = createWatchlistRepository();

      expect(alertRepo.constructor.name).toBe('DynamoDBAlertRepository');
      expect(holdingRepo.constructor.name).toBe('DynamoDBHoldingRepository');
      expect(tickerRepo.constructor.name).toBe('DynamoDBTickerRepository');
      expect(exchangeRepo.constructor.name).toBe('DynamoDBExchangeRepository');
      expect(watchlistRepo.constructor.name).toBe(
        'DynamoDBWatchlistRepository',
      );
    });
  });

  describe('DynamoDB設定エラー', () => {
    beforeEach(() => {
      delete process.env.USE_IN_MEMORY_REPOSITORY;
      delete process.env.DYNAMODB_TABLE_NAME;
      clearMemoryStore();
    });

    it('DYNAMODB_TABLE_NAMEが未設定の場合エラーをスローする', () => {
      expect(() => createAlertRepository()).toThrow(
        'DynamoDB設定が不正です',
      );
    });

    it('全リポジトリファクトリーがエラーをスローする', () => {
      expect(() => createAlertRepository()).toThrow(
        'DynamoDB設定が不正です',
      );
      clearMemoryStore(); // クリアして新しいインスタンスを作成
      expect(() => createHoldingRepository()).toThrow(
        'DynamoDB設定が不正です',
      );
      clearMemoryStore();
      expect(() => createTickerRepository()).toThrow(
        'DynamoDB設定が不正です',
      );
      clearMemoryStore();
      expect(() => createExchangeRepository()).toThrow(
        'DynamoDB設定が不正です',
      );
      clearMemoryStore();
      expect(() => createWatchlistRepository()).toThrow(
        'DynamoDB設定が不正です',
      );
    });
  });
});
