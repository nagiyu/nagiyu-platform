/**
 * Repository Factory
 *
 * 環境変数に基づいてリポジトリインスタンスを生成するファクトリー関数群
 * - USE_IN_MEMORY_DB=true の場合はインメモリ実装を返す
 * - それ以外の場合は DynamoDB 実装を返す
 * - シングルトンパターンでリポジトリインスタンスを管理
 */

import {
  InMemorySingleTableStore,
  createRepositoryFactory,
  getDynamoDBDocumentClient,
  getTableName,
} from '@nagiyu/aws';
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

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  MISSING_DYNAMODB_CONFIG: 'DynamoDB設定が不正です。環境変数を確認してください。',
} as const;

// InMemorySingleTableStore のシングルトン
let memoryStore: InMemorySingleTableStore | null = null;

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
  alertRepositoryFactory.resetRepository();
  holdingRepositoryFactory.resetRepository();
  tickerRepositoryFactory.resetRepository();
  exchangeRepositoryFactory.resetRepository();
  dailySummaryRepositoryFactory.resetRepository();
}

/**
 * Alert Repository を作成
 *
 * @returns AlertRepository インスタンス
 */
export function createAlertRepository(): AlertRepository {
  return alertRepositoryFactory.createRepository();
}

/**
 * Holding Repository を作成
 *
 * @returns HoldingRepository インスタンス
 */
export function createHoldingRepository(): HoldingRepository {
  return holdingRepositoryFactory.createRepository();
}

/**
 * Ticker Repository を作成
 *
 * @returns TickerRepository インスタンス
 */
export function createTickerRepository(): TickerRepository {
  return tickerRepositoryFactory.createRepository();
}

/**
 * Exchange Repository を作成
 *
 * @returns ExchangeRepository インスタンス
 */
export function createExchangeRepository(): ExchangeRepository {
  return exchangeRepositoryFactory.createRepository();
}

/**
 * DailySummary Repository を作成
 *
 * @returns DailySummaryRepository インスタンス
 */
export function createDailySummaryRepository(): DailySummaryRepository {
  return dailySummaryRepositoryFactory.createRepository();
}

function createDynamoDBRepository<TRepository>(
  createRepository: (
    docClient: ReturnType<typeof getDynamoDBDocumentClient>,
    tableName: string
  ) => TRepository
): TRepository {
  try {
    const docClient = getDynamoDBDocumentClient();
    const tableName = getTableName();
    return createRepository(docClient, tableName);
  } catch (error) {
    throw new Error(ERROR_MESSAGES.MISSING_DYNAMODB_CONFIG, { cause: error });
  }
}

const alertRepositoryFactory = createRepositoryFactory<AlertRepository>({
  createInMemoryRepository: () => new InMemoryAlertRepository(getOrCreateMemoryStore()),
  createDynamoDBRepository: () =>
    createDynamoDBRepository(
      (docClient, tableName) => new DynamoDBAlertRepository(docClient, tableName)
    ),
});

const holdingRepositoryFactory = createRepositoryFactory<HoldingRepository>({
  createInMemoryRepository: () => new InMemoryHoldingRepository(getOrCreateMemoryStore()),
  createDynamoDBRepository: () =>
    createDynamoDBRepository(
      (docClient, tableName) => new DynamoDBHoldingRepository(docClient, tableName)
    ),
});

const tickerRepositoryFactory = createRepositoryFactory<TickerRepository>({
  createInMemoryRepository: () => new InMemoryTickerRepository(getOrCreateMemoryStore()),
  createDynamoDBRepository: () =>
    createDynamoDBRepository(
      (docClient, tableName) => new DynamoDBTickerRepository(docClient, tableName)
    ),
});

const exchangeRepositoryFactory = createRepositoryFactory<ExchangeRepository>({
  createInMemoryRepository: () => new InMemoryExchangeRepository(getOrCreateMemoryStore()),
  createDynamoDBRepository: () =>
    createDynamoDBRepository(
      (docClient, tableName) => new DynamoDBExchangeRepository(docClient, tableName)
    ),
});

const dailySummaryRepositoryFactory = createRepositoryFactory<DailySummaryRepository>({
  createInMemoryRepository: () => new InMemoryDailySummaryRepository(getOrCreateMemoryStore()),
  createDynamoDBRepository: () =>
    createDynamoDBRepository(
      (docClient, tableName) => new DynamoDBDailySummaryRepository(docClient, tableName)
    ),
});
