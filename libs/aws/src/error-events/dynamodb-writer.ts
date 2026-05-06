/**
 * DynamoDB 実装の ErrorEventWriter
 *
 * Single Table Design の規約に従い、エラーイベントを既定のキー設計で書き込む。
 */

import { PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ErrorEvent } from '@nagiyu/common';
import {
  buildErrorEventPK,
  buildErrorEventSK,
  computeErrorEventTtl,
  ERROR_EVENT_ENTITY_TYPE,
  ERROR_EVENT_GSI1_PK,
  type ErrorEventWriter,
} from './writer.js';

const ERROR_MESSAGES = {
  INVALID_EVENT_ID: 'eventId は空文字にできません',
  INVALID_SERVICE_ID: 'serviceId は空文字にできません',
  INVALID_OCCURRED_AT: 'occurredAt は空文字にできません',
  INVALID_TITLE: 'title は空文字にできません',
} as const;

/**
 * DynamoDB をバックエンドとする ErrorEventWriter 実装。
 */
export class DynamoDBErrorEventWriter implements ErrorEventWriter {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  public async put(event: ErrorEvent): Promise<void> {
    if (!event.eventId) {
      throw new Error(ERROR_MESSAGES.INVALID_EVENT_ID);
    }
    if (!event.serviceId) {
      throw new Error(ERROR_MESSAGES.INVALID_SERVICE_ID);
    }
    if (!event.occurredAt) {
      throw new Error(ERROR_MESSAGES.INVALID_OCCURRED_AT);
    }
    if (!event.title) {
      throw new Error(ERROR_MESSAGES.INVALID_TITLE);
    }

    const sortKey = buildErrorEventSK(event.occurredAt, event.eventId);
    const now = Date.now();

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: buildErrorEventPK(event.serviceId),
          SK: sortKey,
          Type: ERROR_EVENT_ENTITY_TYPE,
          GSI1PK: ERROR_EVENT_GSI1_PK,
          GSI1SK: sortKey,
          eventId: event.eventId,
          serviceId: event.serviceId,
          source: event.source,
          severity: event.severity,
          title: event.title,
          message: event.message,
          context: event.context,
          occurredAt: event.occurredAt,
          ttl: computeErrorEventTtl(event.occurredAt),
          CreatedAt: now,
          UpdatedAt: now,
        },
      })
    );
  }
}
