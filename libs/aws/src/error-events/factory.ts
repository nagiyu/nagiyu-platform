/**
 * ErrorEventWriter Factory
 *
 * 環境変数 `USE_IN_MEMORY_DB` に応じて in-memory / DynamoDB の実装を切り替える。
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createRepositoryFactory } from '../dynamodb/repository-factory.js';
import { requireDynamoParams } from '../dynamodb/repository-registry.js';
import { DynamoDBErrorEventWriter } from './dynamodb-writer.js';
import { InMemoryErrorEventWriter } from './in-memory-writer.js';
import type { ErrorEventWriter } from './writer.js';

const errorEventWriterFactory = createRepositoryFactory<
  ErrorEventWriter,
  [DynamoDBDocumentClient | undefined, string | undefined]
>({
  createInMemoryRepository: () => new InMemoryErrorEventWriter(),
  createDynamoDBRepository: (docClient, tableName) => {
    const params = requireDynamoParams(docClient, tableName);
    return new DynamoDBErrorEventWriter(params.docClient, params.tableName);
  },
});

/**
 * `ErrorEventWriter` を生成する。
 *
 * - `USE_IN_MEMORY_DB=true` のとき in-memory 実装
 * - それ以外は DynamoDB 実装（docClient / tableName 必須）
 *
 * 一度生成されたインスタンスはシングルトンとして再利用される。
 * テストで状態分離が必要な場合は `resetErrorEventWriter()` を呼んでから再生成すること。
 */
export function createErrorEventWriter(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): ErrorEventWriter {
  return errorEventWriterFactory.createRepository(docClient, tableName);
}

/**
 * 内部のシングルトンインスタンスを破棄する。テスト用。
 */
export function resetErrorEventWriter(): void {
  errorEventWriterFactory.resetRepository();
}
