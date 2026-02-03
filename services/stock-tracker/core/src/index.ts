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

// Legacy repository classes (for backward compatibility - Alert, Holding, Ticker)
export * from './repositories/ticker.js';
export * from './repositories/holding.js';
export * from './repositories/alert.js';

// Repository Interfaces - Exchange and Watchlist (new)
export * from './repositories/exchange.repository.interface.js';
export * from './repositories/watchlist.repository.interface.js';

// Entities - Exchange and Watchlist (new)
export * from './entities/exchange.entity.js';
export * from './entities/watchlist.entity.js';

// Mappers - Exchange and Watchlist (new)
export * from './mappers/exchange.mapper.js';
export * from './mappers/watchlist.mapper.js';

// DynamoDB Implementations - Exchange and Watchlist (new)
export * from './repositories/dynamodb-exchange.repository.js';
export * from './repositories/dynamodb-watchlist.repository.js';

// InMemory Implementations - Exchange and Watchlist (new)
export * from './repositories/in-memory-exchange.repository.js';
export * from './repositories/in-memory-watchlist.repository.js';

// Services
export * from './services/auth.js';
export * from './services/alert-evaluator.js';
export * from './services/price-calculator.js';
export * from './services/trading-hours-checker.js';
export * from './services/tradingview-client.js';
