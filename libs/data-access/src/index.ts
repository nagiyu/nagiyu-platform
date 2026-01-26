/**
 * @nagiyu/data-access
 *
 * データアクセス層の共通ライブラリ
 * DynamoDB 抽象化レイヤーとインメモリ実装を提供
 */

// インターフェース
export type { RepositoryConfig } from './interfaces/repository.interface.js';
export type { PaginationOptions, PaginatedResult } from './interfaces/pagination.interface.js';

// Mapper
export type { DynamoDBItem } from './mapper/dynamodb-item.interface.js';
export type { EntityMapper } from './mapper/entity-mapper.interface.js';

// エラー
export {
  RepositoryError,
  EntityNotFoundError,
  EntityAlreadyExistsError,
  InvalidEntityDataError,
  DatabaseError,
} from './errors/repository-errors.js';

// InMemory 実装
export {
  InMemorySingleTableStore,
  type QueryCondition,
  type AttributeQueryCondition,
} from './in-memory/single-table-store.js';
