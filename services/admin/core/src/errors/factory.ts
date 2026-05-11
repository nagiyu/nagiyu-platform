/**
 * ErrorEventReader Factory
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { registerDynamoRepositories } from '@nagiyu/aws';
import { DynamoDBErrorEventReader } from './dynamodb-reader.js';
import { InMemoryErrorEventReader } from './in-memory-reader.js';
import type { ErrorEventReader } from './reader.js';

const errorEventReaderRegistry = registerDynamoRepositories<{
  errorEventReader: ErrorEventReader;
}>({
  errorEventReader: {
    createInMemoryRepository: () => new InMemoryErrorEventReader(),
    createDynamoDBRepository: ({ docClient, tableName }) =>
      new DynamoDBErrorEventReader(docClient, tableName),
  },
});

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
 * 内部のシングルトンインスタンスを破棄する。テスト用。
 */
export function resetErrorEventReader(): void {
  errorEventReaderRegistry.errorEventReader.resetRepository();
}
