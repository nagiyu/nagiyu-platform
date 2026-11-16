/**
 * ErrorEventReader Factory
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  getInMemoryErrorEventStore,
  registerDynamoRepositories,
  resetInMemoryErrorEventStore,
  type InMemorySingleTableStore,
} from '@nagiyu/aws';
import { DynamoDBErrorEventReader } from './dynamodb-reader.js';
import { InMemoryErrorEventReader } from './in-memory-reader.js';
import type { ErrorEventReader } from './reader.js';

// Writer (libs/aws) が書いた InMemory のイベントを読めるよう、同じ共有ストアを使う
const errorEventReaderRegistry = registerDynamoRepositories<
  { errorEventReader: ErrorEventReader },
  InMemorySingleTableStore
>(
  {
    errorEventReader: {
      createInMemoryRepository: (store) => new InMemoryErrorEventReader(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBErrorEventReader(docClient, tableName),
    },
  },
  { keyPrefix: 'admin', createSharedStore: getInMemoryErrorEventStore }
);

/**
 * `ErrorEventReader` を生成する。
 *
 * - `USE_IN_MEMORY_DB=true` のとき in-memory 実装
 * - それ以外で引数省略時は env から `getDynamoDBDocumentClient()` / `getTableName()` を呼出
 */
export function createErrorEventReader(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): ErrorEventReader {
  return errorEventReaderRegistry.errorEventReader.createRepository(docClient, tableName);
}

/**
 * Reader のインスタンスと InMemory の共有ストアを破棄する。テスト用。
 */
export function resetErrorEventReader(): void {
  errorEventReaderRegistry.resetAll();
  resetInMemoryErrorEventStore();
}
