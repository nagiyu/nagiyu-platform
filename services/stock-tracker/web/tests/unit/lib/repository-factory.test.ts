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

// モジュールのモック
jest.mock('../../../lib/dynamodb', () => ({
  getDynamoDBClient: jest.fn(),
  getTableName: jest.fn(() => 'test-table'),
}));

jest.mock('@nagiyu/stock-tracker-core', () => {
  const actual = jest.requireActual('@nagiyu/stock-tracker-core');
  return {
    ...actual,
    DynamoDBAlertRepository: jest.fn().mockImplementation(() => ({
      getById: jest.fn(),
    })),
    DynamoDBHoldingRepository: jest.fn().mockImplementation(() => ({
      getById: jest.fn(),
    })),
    DynamoDBTickerRepository: jest.fn().mockImplementation(() => ({
      getById: jest.fn(),
    })),
    DynamoDBExchangeRepository: jest.fn().mockImplementation(() => ({
      getById: jest.fn(),
    })),
    DynamoDBWatchlistRepository: jest.fn().mockImplementation(() => ({
      getById: jest.fn(),
    })),
  };
});

describe('Repository Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    clearMemoryStore();
  });

  afterEach(() => {
    process.env = originalEnv;
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

    it('シングルトンパターンが機能する', () => {
      const repo1 = createAlertRepository();
      const repo2 = createAlertRepository();
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
  });

  describe('DynamoDB設定エラー', () => {
    beforeEach(() => {
      delete process.env.USE_IN_MEMORY_REPOSITORY;
      delete process.env.DYNAMODB_TABLE_NAME;
    });

    it('DYNAMODB_TABLE_NAMEが未設定の場合エラーをスローする', () => {
      expect(() => createAlertRepository()).toThrow('DynamoDB設定が不正です');
    });
  });
});
