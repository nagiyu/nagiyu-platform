/**
 * DynamoDB 共通機能エクスポート
 */

// エラークラス
export {
  RepositoryError,
  EntityNotFoundError,
  EntityAlreadyExistsError,
  InvalidEntityDataError,
  DatabaseError,
} from './errors.js';

// 型定義
export type { DynamoDBItem, PaginatedResult, RepositoryConfig } from './types.js';

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

// 抽象基底クラス
export { AbstractDynamoDBRepository } from './abstract-repository.js';
