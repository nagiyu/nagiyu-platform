/**
 * Repository Factory
 *
 * 環境変数に基づいてリポジトリインスタンスを生成するファクトリー関数群
 * - USE_IN_MEMORY_REPOSITORY=true の場合はインメモリ実装を返す
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
// 既存運用との互換性維持のため、legacy フラグも受け付ける。
// stock-tracker の実行環境設定が USE_IN_MEMORY_DB に移行完了後に削除する。
const LEGACY_USE_IN_MEMORY_FLAG = 'USE_IN_MEMORY_REPOSITORY';

// InMemorySingleTableStore のシングルトン
let memoryStore: InMemorySingleTableStore | null = null;

// 各リポジトリのシングルトンインスタンス
let alertRepository: AlertRepository | null = null;
let holdingRepository: HoldingRepository | null = null;
let tickerRepository: TickerRepository | null = null;
let exchangeRepository: ExchangeRepository | null = null;
let dailySummaryRepository: DailySummaryRepository | null = null;
let isInMemoryFlagSynced = false;

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
  dailySummaryRepository = null;
  isInMemoryFlagSynced = false;
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
  return getOrCreateRepository(
    alertRepository,
    (repository) => {
      alertRepository = repository;
    },
    () => alertRepositoryFactory.createRepository()
  );
}

/**
 * Holding Repository を作成
 *
 * @returns HoldingRepository インスタンス
 */
export function createHoldingRepository(): HoldingRepository {
  return getOrCreateRepository(
    holdingRepository,
    (repository) => {
      holdingRepository = repository;
    },
    () => holdingRepositoryFactory.createRepository()
  );
}

/**
 * Ticker Repository を作成
 *
 * @returns TickerRepository インスタンス
 */
export function createTickerRepository(): TickerRepository {
  return getOrCreateRepository(
    tickerRepository,
    (repository) => {
      tickerRepository = repository;
    },
    () => tickerRepositoryFactory.createRepository()
  );
}

/**
 * Exchange Repository を作成
 *
 * @returns ExchangeRepository インスタンス
 */
export function createExchangeRepository(): ExchangeRepository {
  return getOrCreateRepository(
    exchangeRepository,
    (repository) => {
      exchangeRepository = repository;
    },
    () => exchangeRepositoryFactory.createRepository()
  );
}

/**
 * DailySummary Repository を作成
 *
 * @returns DailySummaryRepository インスタンス
 */
export function createDailySummaryRepository(): DailySummaryRepository {
  return getOrCreateRepository(
    dailySummaryRepository,
    (repository) => {
      dailySummaryRepository = repository;
    },
    () => dailySummaryRepositoryFactory.createRepository()
  );
}

/**
 * リポジトリのシングルトン生成を共通化する。
 *
 * @remarks
 * 最初のリポジトリ生成時のみ legacy フラグ同期を行い、
 * 2回目以降は既存インスタンスを返す。
 */
function getOrCreateRepository<TRepository>(
  repository: TRepository | null,
  setRepository: (repository: TRepository) => void,
  create: () => TRepository
): TRepository {
  if (repository) {
    return repository;
  }
  syncUseInMemoryFlag();
  const createdRepository = create();
  setRepository(createdRepository);
  return createdRepository;
}

/**
 * 旧環境変数 `USE_IN_MEMORY_REPOSITORY` を新環境変数 `USE_IN_MEMORY_DB` に同期する。
 *
 * @remarks
 * 同期処理は初回のみ実行し、既に `USE_IN_MEMORY_DB` が設定済みの場合は上書きしない。
 */
function syncUseInMemoryFlag(): void {
  if (isInMemoryFlagSynced) {
    return;
  }
  isInMemoryFlagSynced = true;
  if (process.env.USE_IN_MEMORY_DB !== undefined) {
    return;
  }
  if (process.env[LEGACY_USE_IN_MEMORY_FLAG] !== undefined) {
    process.env.USE_IN_MEMORY_DB = process.env[LEGACY_USE_IN_MEMORY_FLAG];
  }
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
