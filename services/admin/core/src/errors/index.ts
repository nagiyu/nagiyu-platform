/**
 * Errors モジュール
 *
 * Admin の永続化済みエラーイベント参照のためのドメインロジック。
 */

export type {
  ErrorEventReader,
  ListErrorEventsQuery,
  ListErrorEventsResult,
} from './reader.js';
export {
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  encodeCursor,
  decodeCursor,
  normalizeLimit,
} from './reader.js';
export { DynamoDBErrorEventReader } from './dynamodb-reader.js';
export { InMemoryErrorEventReader } from './in-memory-reader.js';
export { createErrorEventReader, resetErrorEventReader } from './factory.js';
