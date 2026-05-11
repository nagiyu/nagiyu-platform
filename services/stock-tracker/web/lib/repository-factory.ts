/**
 * Repository Factory
 *
 * 環境変数に基づいてリポジトリインスタンスを生成するファクトリー関数群。
 * `@nagiyu/aws` の `registerDynamoRepositories` を利用し、5 リポジトリと
 * 共有 InMemorySingleTableStore を一括管理する。
 *
 * - USE_IN_MEMORY_DB=true の場合はインメモリ実装を返す
 * - それ以外は DynamoDB 実装を返す（env から自動取得）
 * - シングルトンパターンでリポジトリインスタンスを管理
 */

import { InMemorySingleTableStore, registerDynamoRepositories } from '@nagiyu/aws';
import type {
  AlertRepository,
  HoldingRepository,
  TickerRepository,
  ExchangeRepository,
  DailySummaryRepository,
} from '@nagiyu/stock-tracker-core';
import {
  DynamoDBAlertRepository,
  DynamoDBDailySummaryRepository,
  DynamoDBHoldingRepository,
  DynamoDBTickerRepository,
  DynamoDBExchangeRepository,
  InMemoryAlertRepository,
  InMemoryDailySummaryRepository,
  InMemoryHoldingRepository,
  InMemoryTickerRepository,
  InMemoryExchangeRepository,
} from '@nagiyu/stock-tracker-core';

const repositoryRegistry = registerDynamoRepositories<
  {
    alert: AlertRepository;
    holding: HoldingRepository;
    ticker: TickerRepository;
    exchange: ExchangeRepository;
    dailySummary: DailySummaryRepository;
  },
  InMemorySingleTableStore
>(
  {
    alert: {
      createInMemoryRepository: (store) => new InMemoryAlertRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBAlertRepository(docClient, tableName),
    },
    holding: {
      createInMemoryRepository: (store) => new InMemoryHoldingRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBHoldingRepository(docClient, tableName),
    },
    ticker: {
      createInMemoryRepository: (store) => new InMemoryTickerRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBTickerRepository(docClient, tableName),
    },
    exchange: {
      createInMemoryRepository: (store) => new InMemoryExchangeRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBExchangeRepository(docClient, tableName),
    },
    dailySummary: {
      createInMemoryRepository: (store) => new InMemoryDailySummaryRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBDailySummaryRepository(docClient, tableName),
    },
  },
  {
    createSharedStore: () => new InMemorySingleTableStore(),
  }
);

/**
 * メモリストアと全リポジトリインスタンスをクリア。
 * テスト終了時に使用。
 */
export function clearMemoryStore(): void {
  repositoryRegistry.resetAll();
}

export function createAlertRepository(): AlertRepository {
  return repositoryRegistry.alert.createRepository();
}

export function createHoldingRepository(): HoldingRepository {
  return repositoryRegistry.holding.createRepository();
}

export function createTickerRepository(): TickerRepository {
  return repositoryRegistry.ticker.createRepository();
}

export function createExchangeRepository(): ExchangeRepository {
  return repositoryRegistry.exchange.createRepository();
}

export function createDailySummaryRepository(): DailySummaryRepository {
  return repositoryRegistry.dailySummary.createRepository();
}
