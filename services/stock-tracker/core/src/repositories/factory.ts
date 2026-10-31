/**
 * リポジトリの生成口。
 *
 * `USE_IN_MEMORY_DB=true` のときはインメモリ実装を、それ以外は DynamoDB 実装を返す。
 * 実装はシングルトンで、InMemory 実装は全リポジトリで 1 つのストアを共有する。
 * 呼び出し側 (web / batch) は実装クラスを直接 new せず、この口を経由する。
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { InMemorySingleTableStore, registerDynamoRepositories } from '@nagiyu/aws';
import type { AlertRepository } from './alert.repository.interface.js';
import type { HoldingRepository } from './holding.repository.interface.js';
import type { TickerRepository } from './ticker.repository.interface.js';
import type { ExchangeRepository } from './exchange.repository.interface.js';
import type { DailySummaryRepository } from './daily-summary.repository.interface.js';
import type { ForecastRepository } from './forecast.repository.interface.js';
import type { MarketForecastRepository } from './market-forecast.repository.interface.js';
import type { ModelSnapshotRepository } from './model-snapshot.repository.interface.js';
import type { PerformanceDailyRepository } from './performance-daily.repository.interface.js';
import { DynamoDBAlertRepository } from './dynamodb-alert.repository.js';
import { DynamoDBHoldingRepository } from './dynamodb-holding.repository.js';
import { DynamoDBTickerRepository } from './dynamodb-ticker.repository.js';
import { DynamoDBExchangeRepository } from './dynamodb-exchange.repository.js';
import { DynamoDBDailySummaryRepository } from './dynamodb-daily-summary.repository.js';
import { DynamoDBForecastRepository } from './dynamodb-forecast.repository.js';
import { DynamoDBMarketForecastRepository } from './dynamodb-market-forecast.repository.js';
import { DynamoDBModelSnapshotRepository } from './dynamodb-model-snapshot.repository.js';
import { DynamoDBPerformanceDailyRepository } from './dynamodb-performance-daily.repository.js';
import { InMemoryAlertRepository } from './in-memory-alert.repository.js';
import { InMemoryHoldingRepository } from './in-memory-holding.repository.js';
import { InMemoryTickerRepository } from './in-memory-ticker.repository.js';
import { InMemoryExchangeRepository } from './in-memory-exchange.repository.js';
import { InMemoryDailySummaryRepository } from './in-memory-daily-summary.repository.js';
import { InMemoryForecastRepository } from './in-memory-forecast.repository.js';
import { InMemoryMarketForecastRepository } from './in-memory-market-forecast.repository.js';
import { InMemoryModelSnapshotRepository } from './in-memory-model-snapshot.repository.js';
import { InMemoryPerformanceDailyRepository } from './in-memory-performance-daily.repository.js';

const repositoryRegistry = registerDynamoRepositories<
  {
    alert: AlertRepository;
    holding: HoldingRepository;
    ticker: TickerRepository;
    exchange: ExchangeRepository;
    dailySummary: DailySummaryRepository;
    forecast: ForecastRepository;
    marketForecast: MarketForecastRepository;
    modelSnapshot: ModelSnapshotRepository;
    performanceDaily: PerformanceDailyRepository;
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
    forecast: {
      createInMemoryRepository: (store) => new InMemoryForecastRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBForecastRepository(docClient, tableName),
    },
    marketForecast: {
      createInMemoryRepository: (store) => new InMemoryMarketForecastRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBMarketForecastRepository(docClient, tableName),
    },
    modelSnapshot: {
      createInMemoryRepository: (store) => new InMemoryModelSnapshotRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBModelSnapshotRepository(docClient, tableName),
    },
    performanceDaily: {
      createInMemoryRepository: (store) => new InMemoryPerformanceDailyRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBPerformanceDailyRepository(docClient, tableName),
    },
  },
  {
    keyPrefix: 'stock-tracker',
    createSharedStore: () => new InMemorySingleTableStore(),
  }
);

/**
 * 全リポジトリのインスタンスと共有 InMemory ストアを捨てる。
 * テストの状態をそろえるために使う。
 */
export function clearMemoryStore(): void {
  repositoryRegistry.resetAll();
}

export function createAlertRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): AlertRepository {
  return repositoryRegistry.alert.createRepository(docClient, tableName);
}

export function createHoldingRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): HoldingRepository {
  return repositoryRegistry.holding.createRepository(docClient, tableName);
}

export function createTickerRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): TickerRepository {
  return repositoryRegistry.ticker.createRepository(docClient, tableName);
}

export function createExchangeRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): ExchangeRepository {
  return repositoryRegistry.exchange.createRepository(docClient, tableName);
}

export function createDailySummaryRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): DailySummaryRepository {
  return repositoryRegistry.dailySummary.createRepository(docClient, tableName);
}

export function createForecastRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): ForecastRepository {
  return repositoryRegistry.forecast.createRepository(docClient, tableName);
}

export function createMarketForecastRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): MarketForecastRepository {
  return repositoryRegistry.marketForecast.createRepository(docClient, tableName);
}

export function createModelSnapshotRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): ModelSnapshotRepository {
  return repositoryRegistry.modelSnapshot.createRepository(docClient, tableName);
}

export function createPerformanceDailyRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): PerformanceDailyRepository {
  return repositoryRegistry.performanceDaily.createRepository(docClient, tableName);
}
