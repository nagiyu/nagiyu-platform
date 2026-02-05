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
export * from './repositories/exchange.js';
export * from './repositories/ticker.js';
export * from './repositories/holding.js';
export * from './repositories/watchlist.js';
export * from './repositories/alert.js';
export * from './services/auth.js';
export * from './services/alert-evaluator.js';
export * from './services/price-calculator.js';
export * from './services/trading-hours-checker.js';
export * from './services/tradingview-client.js';

// 新しいエンティティ（types.jsと重複しないように個別エクスポート）
export type {
  AlertEntity,
  CreateAlertInput,
  UpdateAlertInput,
  AlertKey,
} from './entities/alert.entity.js';
export type {
  TickerEntity,
  CreateTickerInput,
  UpdateTickerInput,
  TickerKey,
} from './entities/ticker.entity.js';
export type {
  HoldingEntity,
  CreateHoldingInput,
  UpdateHoldingInput,
  HoldingKey,
} from './entities/holding.entity.js';

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

// InMemoryリポジトリ実装（テスト用）
export { InMemoryAlertRepository } from './repositories/in-memory-alert.repository.js';
export { InMemoryTickerRepository } from './repositories/in-memory-ticker.repository.js';
export { InMemoryHoldingRepository } from './repositories/in-memory-holding.repository.js';
