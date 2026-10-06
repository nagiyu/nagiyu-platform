/**
 * DynamoDB 共通機能エクスポート
 */

// エラークラス・マッピング関数
export {
  RepositoryError,
  EntityNotFoundError,
  EntityAlreadyExistsError,
  InvalidEntityDataError,
  DatabaseError,
  mapConditionalCheckFailed,
  isConditionalCheckFailed,
  toDatabaseError,
} from './errors.js';

// cursor ヘルパー
export { encodeCursor, decodeCursor } from './cursor.js';

// 型定義
export type {
  DynamoDBItem,
  PaginatedResult,
  PaginationOptions,
  RepositoryConfig,
} from './types.js';

// バリデーション関数
export {
  validateStringField,
  validateNumberField,
  validateEnumField,
  validateBooleanField,
  validateTimestampField,
} from './validators.js';

// ヘルパー関数
export {
  buildUpdateExpression,
  conditionalPut,
  conditionalUpdate,
  conditionalDelete,
} from './helpers.js';
export { getDynamoDBDocumentClient, getTableName, clearDynamoDBClientCache } from './client.js';
export { createRepositoryFactory } from './repository-factory.js';
export {
  registerDynamoRepositories,
  requireDynamoParams,
  type DynamoRepositoryParams,
  type DynamoRepositoryDef,
  type DynamoRepositoryHandle,
  type DynamoRepositoryRegistry,
  type RegisterDynamoRepositoriesOptions,
} from './repository-registry.js';

// 抽象基底クラス
export { AbstractDynamoDBRepository } from './abstract-repository.js';

// Mapper インターフェース
export type { EntityMapper } from './mapper/entity-mapper.interface.js';

// InMemory 実装
export {
  InMemorySingleTableStore,
  type QueryCondition,
  type AttributeQueryCondition,
  type AttributeProjection,
} from './in-memory/single-table-store.js';

// ページネーション
export { queryPages, queryAllItems, scanAllItems } from './pagination.js';

// バッチ処理
export {
  batchWriteAll,
  batchGetAll,
  BatchRetryExhaustedError,
  type BatchRetryOptions,
  type BatchWriteRequest,
} from './batch.js';
