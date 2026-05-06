/**
 * ErrorEvents モジュール
 *
 * プラットフォーム共通のエラーイベントを DynamoDB に書き込むための SDK。
 */

export type { ErrorEventWriter, ErrorEventKey } from './writer.js';
export {
  ERROR_EVENT_ENTITY_TYPE,
  ERROR_EVENT_GSI1_PK,
  ERROR_EVENT_TTL_DAYS,
  ERROR_EVENT_PK_PREFIX,
  ERROR_EVENT_SK_PREFIX,
  buildErrorEventPK,
  buildErrorEventSK,
  computeErrorEventTtl,
} from './writer.js';
export { DynamoDBErrorEventWriter } from './dynamodb-writer.js';
export { InMemoryErrorEventWriter } from './in-memory-writer.js';
export { createErrorEventWriter, resetErrorEventWriter } from './factory.js';
