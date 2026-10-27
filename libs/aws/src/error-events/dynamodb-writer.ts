/**
 * DynamoDB 実装の ErrorEventWriter
 *
 * Single Table Design の規約に従い、エラーイベントを既定のキー設計で書き込む。
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ErrorEvent } from '@nagiyu/common';
import { DynamoDBEntityStore } from '../dynamodb/store/dynamodb-entity-store.js';
import type { EntityStore } from '../dynamodb/store/entity-store.interface.js';
import { ErrorEventMapper } from './mapper.js';
import { assertWritableErrorEvent } from './validation.js';
import type { ErrorEventKey, ErrorEventWriter } from './writer.js';

/**
 * DynamoDB をバックエンドとする ErrorEventWriter 実装。
 */
export class DynamoDBErrorEventWriter implements ErrorEventWriter {
  private readonly entityStore: EntityStore<ErrorEvent, ErrorEventKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, new ErrorEventMapper());
  }

  public async put(event: ErrorEvent): Promise<void> {
    assertWritableErrorEvent(event);
    // eventId は UUID で衝突しないため create で書く。同じ eventId の再投入は上書きせず拒否する
    await this.entityStore.create(event);
  }
}
