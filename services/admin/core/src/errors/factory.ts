/**
 * ErrorEventReader Factory
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createRepositoryFactory } from '@nagiyu/aws';
import { DynamoDBErrorEventReader } from './dynamodb-reader.js';
import { InMemoryErrorEventReader } from './in-memory-reader.js';
import type { ErrorEventReader } from './reader.js';

const ERROR_MESSAGES = {
  DYNAMODB_PARAMS_REQUIRED: 'DynamoDB 実装には docClient と tableName が必要です',
} as const;

function requireDynamoParams(
  docClient: DynamoDBDocumentClient | undefined,
  tableName: string | undefined
): { docClient: DynamoDBDocumentClient; tableName: string } {
  if (!docClient || !tableName) {
    throw new Error(ERROR_MESSAGES.DYNAMODB_PARAMS_REQUIRED);
  }
  return { docClient, tableName };
}

const errorEventReaderFactory = createRepositoryFactory<
  ErrorEventReader,
  [DynamoDBDocumentClient | undefined, string | undefined]
>({
  createInMemoryRepository: () => new InMemoryErrorEventReader(),
  createDynamoDBRepository: (docClient, tableName) => {
    const params = requireDynamoParams(docClient, tableName);
    return new DynamoDBErrorEventReader(params.docClient, params.tableName);
  },
});

/**
 * `ErrorEventReader` を生成する。
 *
 * - `USE_IN_MEMORY_DB=true` のとき in-memory 実装
 * - それ以外は DynamoDB 実装（docClient / tableName 必須）
 */
export function createErrorEventReader(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): ErrorEventReader {
  return errorEventReaderFactory.createRepository(docClient, tableName);
}

/**
 * 内部のシングルトンインスタンスを破棄する。テスト用。
 */
export function resetErrorEventReader(): void {
  errorEventReaderFactory.resetRepository();
}
