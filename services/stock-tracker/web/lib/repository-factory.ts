/**
 * Repository Factory
 *
 * 環境変数に基づいてリポジトリインスタンスを生成するファクトリー関数群
 * - USE_IN_MEMORY_REPOSITORY=true の場合はインメモリ実装を返す
 * - それ以外の場合は DynamoDB 実装を返す
 * - シングルトンパターンでリポジトリインスタンスを管理
 */

import { InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  IAlertRepository,
  IHoldingRepository,
  ITickerRepository,
  IExchangeRepository,
  IWatchlistRepository,
} from '@nagiyu/stock-tracker-core';
import {
  DynamoDBAlertRepository,
  DynamoDBHoldingRepository,
  DynamoDBTickerRepository,
  DynamoDBExchangeRepository,
  DynamoDBWatchlistRepository,
  InMemoryAlertRepository,
  InMemoryHoldingRepository,
  InMemoryTickerRepository,
  InMemoryExchangeRepository,
  InMemoryWatchlistRepository,
} from '@nagiyu/stock-tracker-core';
import { getDynamoDBClient, getTableName } from './dynamodb';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  MISSING_DYNAMODB_CONFIG: 'DynamoDB設定が不正です。環境変数を確認してください。',
} as const;

// InMemorySingleTableStore のシングルトン
let memoryStore: InMemorySingleTableStore | null = null;

// 各リポジトリのシングルトンインスタンス
let alertRepository: IAlertRepository | null = null;
let holdingRepository: IHoldingRepository | null = null;
let tickerRepository: ITickerRepository | null = null;
let exchangeRepository: IExchangeRepository | null = null;
let watchlistRepository: IWatchlistRepository | null = null;

/**
 * InMemorySingleTableStore のシングルトンインスタンスを取得または作成
 *
 * @returns InMemorySingleTableStore インスタンス
 */
function getOrCreateMemoryStore(): InMemorySingleTableStore {
  if (!memoryStore) {
    memoryStore = new InMemorySingleTableStore();
  }
  return memoryStore;
}

/**
 * メモリストアと全リポジトリインスタンスをクリア
 *
 * テスト終了時に使用
 */
export function clearMemoryStore(): void {
  memoryStore = null;
  alertRepository = null;
  holdingRepository = null;
  tickerRepository = null;
  exchangeRepository = null;
  watchlistRepository = null;
}

/**
 * Alert Repository を作成
 *
 * @returns AlertRepository インスタンス
 */
export function createAlertRepository(): IAlertRepository {
  if (alertRepository) {
    return alertRepository;
  }

  const useInMemory = process.env.USE_IN_MEMORY_REPOSITORY === 'true';

  if (useInMemory) {
    // InMemory実装を使用
    const store = getOrCreateMemoryStore();
    alertRepository = new InMemoryAlertRepository(store);
  } else {
    // DynamoDB実装を使用
    try {
      const docClient = getDynamoDBClient();
      const tableName = getTableName();
      alertRepository = new DynamoDBAlertRepository(docClient, tableName);
    } catch {
      throw new Error(ERROR_MESSAGES.MISSING_DYNAMODB_CONFIG);
    }
  }

  return alertRepository;
}

/**
 * Holding Repository を作成
 *
 * @returns HoldingRepository インスタンス
 */
export function createHoldingRepository(): IHoldingRepository {
  if (holdingRepository) {
    return holdingRepository;
  }

  const useInMemory = process.env.USE_IN_MEMORY_REPOSITORY === 'true';

  if (useInMemory) {
    // InMemory実装を使用
    const store = getOrCreateMemoryStore();
    holdingRepository = new InMemoryHoldingRepository(store);
  } else {
    // DynamoDB実装を使用
    try {
      const docClient = getDynamoDBClient();
      const tableName = getTableName();
      holdingRepository = new DynamoDBHoldingRepository(docClient, tableName);
    } catch {
      throw new Error(ERROR_MESSAGES.MISSING_DYNAMODB_CONFIG);
    }
  }

  return holdingRepository;
}

/**
 * Ticker Repository を作成
 *
 * @returns TickerRepository インスタンス
 */
export function createTickerRepository(): ITickerRepository {
  if (tickerRepository) {
    return tickerRepository;
  }

  const useInMemory = process.env.USE_IN_MEMORY_REPOSITORY === 'true';

  if (useInMemory) {
    // InMemory実装を使用
    const store = getOrCreateMemoryStore();
    tickerRepository = new InMemoryTickerRepository(store);
  } else {
    // DynamoDB実装を使用
    try {
      const docClient = getDynamoDBClient();
      const tableName = getTableName();
      tickerRepository = new DynamoDBTickerRepository(docClient, tableName);
    } catch {
      throw new Error(ERROR_MESSAGES.MISSING_DYNAMODB_CONFIG);
    }
  }

  return tickerRepository;
}

/**
 * Exchange Repository を作成
 *
 * @returns ExchangeRepository インスタンス
 */
export function createExchangeRepository(): IExchangeRepository {
  if (exchangeRepository) {
    return exchangeRepository;
  }

  const useInMemory = process.env.USE_IN_MEMORY_REPOSITORY === 'true';

  if (useInMemory) {
    // InMemory実装を使用
    const store = getOrCreateMemoryStore();
    exchangeRepository = new InMemoryExchangeRepository(store);
  } else {
    // DynamoDB実装を使用
    try {
      const docClient = getDynamoDBClient();
      const tableName = getTableName();
      exchangeRepository = new DynamoDBExchangeRepository(docClient, tableName);
    } catch {
      throw new Error(ERROR_MESSAGES.MISSING_DYNAMODB_CONFIG);
    }
  }

  return exchangeRepository;
}

/**
 * Watchlist Repository を作成
 *
 * @returns WatchlistRepository インスタンス
 */
export function createWatchlistRepository(): IWatchlistRepository {
  if (watchlistRepository) {
    return watchlistRepository;
  }

  const useInMemory = process.env.USE_IN_MEMORY_REPOSITORY === 'true';

  if (useInMemory) {
    // InMemory実装を使用
    const store = getOrCreateMemoryStore();
    watchlistRepository = new InMemoryWatchlistRepository(store);
  } else {
    // DynamoDB実装を使用
    try {
      const docClient = getDynamoDBClient();
      const tableName = getTableName();
      watchlistRepository = new DynamoDBWatchlistRepository(docClient, tableName);
    } catch {
      throw new Error(ERROR_MESSAGES.MISSING_DYNAMODB_CONFIG);
    }
  }

  return watchlistRepository;
}
