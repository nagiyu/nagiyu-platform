/**
 * Stock Tracker Core Package
 *
 * ビジネスロジック層（core パッケージ）
 * - DynamoDB アクセス層 (repositories/)
 * - ビジネスロジック (services/)
 * - バリデーション関数 (validation/)
 * - 型定義 (types.ts)
 */

export * from './types.js';
export * from './validation/helpers.js';
export * from './validation/index.js';
export { CandlestickPattern } from './patterns/candlestick-pattern.js';
export { MorningStar } from './patterns/morning-star.js';
export { PATTERN_REGISTRY } from './patterns/pattern-registry.js';

// Error Classes (for backward compatibility)
// Re-export generic error classes from @nagiyu/aws with specific names
import { EntityNotFoundError, EntityAlreadyExistsError, InvalidEntityDataError } from '@nagiyu/aws';

export { EntityNotFoundError as AlertNotFoundError };
export { EntityAlreadyExistsError as AlertAlreadyExistsError };
export { InvalidEntityDataError as InvalidAlertDataError };

export { EntityNotFoundError as HoldingNotFoundError };
export { EntityAlreadyExistsError as HoldingAlreadyExistsError };
export { InvalidEntityDataError as InvalidHoldingDataError };

export { EntityNotFoundError as TickerNotFoundError };
export { EntityAlreadyExistsError as TickerAlreadyExistsError };
export { InvalidEntityDataError as InvalidTickerDataError };

export { EntityNotFoundError as ExchangeNotFoundError };

// Watchlist errors are already exported from dynamodb-watchlist.repository.ts
export {
  WatchlistNotFoundError,
  InvalidWatchlistDataError,
  WatchlistAlreadyExistsError,
} from './repositories/dynamodb-watchlist.repository.js';

// Repository Interfaces
export type { AlertRepository } from './repositories/alert.repository.interface.js';
export type { HoldingRepository } from './repositories/holding.repository.interface.js';
export type { TickerRepository } from './repositories/ticker.repository.interface.js';
export type { ExchangeRepository } from './repositories/exchange.repository.interface.js';
export type { WatchlistRepository } from './repositories/watchlist.repository.interface.js';
export type { DailySummaryRepository } from './repositories/daily-summary.repository.interface.js';

// Entities (explicit exports to avoid conflicts with types.ts)
export type {
  AlertEntity,
  CreateAlertInput,
  UpdateAlertInput,
  AlertKey,
} from './entities/alert.entity.js';
export type {
  HoldingEntity,
  CreateHoldingInput,
  UpdateHoldingInput,
  HoldingKey,
} from './entities/holding.entity.js';
export type {
  TickerEntity,
  CreateTickerInput,
  UpdateTickerInput,
} from './entities/ticker.entity.js';
export type {
  ExchangeEntity,
  CreateExchangeInput,
  UpdateExchangeInput,
} from './entities/exchange.entity.js';
export type { WatchlistEntity, CreateWatchlistInput } from './entities/watchlist.entity.js';
export type {
  DailySummaryEntity,
  CreateDailySummaryInput,
  DailySummaryKey,
} from './entities/daily-summary.entity.js';

// Mappers
export * from './mappers/alert.mapper.js';
export * from './mappers/holding.mapper.js';
export * from './mappers/ticker.mapper.js';
export * from './mappers/exchange.mapper.js';
export * from './mappers/watchlist.mapper.js';
export * from './mappers/daily-summary.mapper.js';

// DynamoDB Implementations
export * from './repositories/dynamodb-alert.repository.js';
export * from './repositories/dynamodb-holding.repository.js';
export * from './repositories/dynamodb-ticker.repository.js';
export * from './repositories/dynamodb-exchange.repository.js';
export * from './repositories/dynamodb-watchlist.repository.js';
export * from './repositories/dynamodb-daily-summary.repository.js';

// InMemory Implementations
export * from './repositories/in-memory-alert.repository.js';
export * from './repositories/in-memory-holding.repository.js';
export * from './repositories/in-memory-ticker.repository.js';
export * from './repositories/in-memory-exchange.repository.js';
export * from './repositories/in-memory-watchlist.repository.js';
export * from './repositories/in-memory-daily-summary.repository.js';

// Services
export * from './services/auth.js';
export * from './services/alert-evaluator.js';
export * from './services/price-calculator.js';
export * from './services/trading-hours-checker.js';
export * from './services/tradingview-client.js';

// マッパー（新規エクスポート）
export { AlertMapper } from './mappers/alert.mapper.js';
export { TickerMapper } from './mappers/ticker.mapper.js';
export { HoldingMapper } from './mappers/holding.mapper.js';

// 新しいリポジトリインターフェース（明示的に名前を変更してエクスポート）
export type { AlertRepository as IAlertRepository } from './repositories/alert.repository.interface.js';
export type { TickerRepository as ITickerRepository } from './repositories/ticker.repository.interface.js';
export type { HoldingRepository as IHoldingRepository } from './repositories/holding.repository.interface.js';

// 新しいDynamoDBリポジトリ実装
export { DynamoDBAlertRepository } from './repositories/dynamodb-alert.repository.js';
export { DynamoDBTickerRepository } from './repositories/dynamodb-ticker.repository.js';
export { DynamoDBHoldingRepository } from './repositories/dynamodb-holding.repository.js';
