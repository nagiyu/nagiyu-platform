/**
 * ErrorEventWriter Factory
 *
 * 環境変数 `USE_IN_MEMORY_DB` に応じて in-memory / DynamoDB の実装を切り替える。
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { registerDynamoRepositories } from '../dynamodb/repository-registry.js';
import { InMemorySingleTableStore } from '../dynamodb/in-memory/single-table-store.js';
import { DynamoDBErrorEventWriter } from './dynamodb-writer.js';
import { InMemoryErrorEventWriter } from './in-memory-writer.js';
import { getInMemoryErrorEventStore, resetInMemoryErrorEventStore } from './in-memory-store.js';
import type { ErrorEventWriter } from './writer.js';

// 共有ストアは Reader 側の registry からも参照されるため、registry 内ではなく globalThis に置く
const errorEventWriterRegistry = registerDynamoRepositories<
  { errorEventWriter: ErrorEventWriter },
  InMemorySingleTableStore
>(
  {
    errorEventWriter: {
      createInMemoryRepository: (store) => new InMemoryErrorEventWriter(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBErrorEventWriter(docClient, tableName),
    },
  },
  { keyPrefix: 'error-events', createSharedStore: getInMemoryErrorEventStore }
);

/**
 * `ErrorEventWriter` を生成する。
 *
 * - `USE_IN_MEMORY_DB=true` のとき in-memory 実装 (共有ストアに書く)
 * - それ以外で引数省略時は env から `getDynamoDBDocumentClient()` / `getTableName()` を呼出
 *
 * 一度生成されたインスタンスはシングルトンとして再利用される。
 * テストで状態分離が必要な場合は `resetErrorEventWriter()` を呼んでから再生成すること。
 */
export function createErrorEventWriter(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): ErrorEventWriter {
  return errorEventWriterRegistry.errorEventWriter.createRepository(docClient, tableName);
}

/**
 * Writer のインスタンスと InMemory の共有ストアを破棄する。テスト用。
 *
 * 共有ストアに Item が残ると、固定の eventId で書き直したときに重複で落ちるため、
 * インスタンスと一緒に捨てる。
 */
export function resetErrorEventWriter(): void {
  errorEventWriterRegistry.resetAll();
  resetInMemoryErrorEventStore();
}
