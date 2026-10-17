/**
 * DynamoDB をバックエンドとする ErrorEventReader 実装
 */

import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ErrorEvent } from '@nagiyu/common';
import {
  DynamoDBEntityStore,
  ErrorEventMapper,
  ERROR_EVENT_GSI1_PK,
  ERROR_EVENT_SK_PREFIX,
  buildErrorEventPK,
  type EntityStore,
  type ErrorEventKey,
} from '@nagiyu/aws';
import {
  assertValidRange,
  decodeCursor,
  encodeCursor,
  normalizeLimit,
  type ErrorEventReader,
  type ListErrorEventsQuery,
  type ListErrorEventsResult,
} from './reader.js';

const ALL_BY_OCCURRED_AT_INDEX = 'AllByOccurredAt';

/**
 * SK の上限比較で、同じ時刻の SK (`{ISO}#{eventId}`) をすべて含めるための最大文字。
 */
const SORT_KEY_UPPER_BOUND_SUFFIX = '￿';

type ItemRecord = Record<string, unknown>;

/**
 * 範囲指定の時刻を、SK に埋め込まれた固定長の ISO 文字列 (`.000Z` まで) に揃える。
 *
 * `2026-05-06T00:00:00Z` のような桁違いの表記のまま SK と文字列比較すると、
 * `.` と `Z` の大小で同じ時刻の境界が外れるため。
 */
function toSortKeyTime(time: string): string {
  const millis = Date.parse(time);
  return Number.isNaN(millis) ? time : new Date(millis).toISOString();
}

/**
 * DynamoDB をバックエンドとする ErrorEventReader 実装。
 */
export class DynamoDBErrorEventReader implements ErrorEventReader {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly mapper = new ErrorEventMapper();
  private readonly entityStore: EntityStore<ErrorEvent, ErrorEventKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper);
  }

  public async list(query: ListErrorEventsQuery): Promise<ListErrorEventsResult> {
    assertValidRange(query);

    const limit = normalizeLimit(query.limit);
    const exclusiveStartKey = query.cursor ? decodeCursor(query.cursor) : undefined;

    const useGsi = !query.serviceId;
    const partitionKeyName = useGsi ? 'GSI1PK' : 'PK';
    const sortKeyName = useGsi ? 'GSI1SK' : 'SK';
    const partitionKeyValue = useGsi ? ERROR_EVENT_GSI1_PK : buildErrorEventPK(query.serviceId!);

    const expressionAttributeNames: Record<string, string> = {
      '#pk': partitionKeyName,
    };
    const expressionAttributeValues: Record<string, unknown> = {
      ':pk': partitionKeyValue,
    };

    const conditions: string[] = ['#pk = :pk'];
    const fromKey = query.from ? `${ERROR_EVENT_SK_PREFIX}${toSortKeyTime(query.from)}` : undefined;
    const toKey = query.to
      ? `${ERROR_EVENT_SK_PREFIX}${toSortKeyTime(query.to)}${SORT_KEY_UPPER_BOUND_SUFFIX}`
      : undefined;

    expressionAttributeNames['#sk'] = sortKeyName;
    if (fromKey && toKey) {
      conditions.push('#sk BETWEEN :from AND :to');
      expressionAttributeValues[':from'] = fromKey;
      expressionAttributeValues[':to'] = toKey;
    } else if (fromKey) {
      conditions.push('#sk >= :from');
      expressionAttributeValues[':from'] = fromKey;
    } else if (toKey) {
      conditions.push('#sk <= :to');
      expressionAttributeValues[':to'] = toKey;
    } else {
      conditions.push('begins_with(#sk, :prefix)');
      expressionAttributeValues[':prefix'] = ERROR_EVENT_SK_PREFIX;
    }

    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: useGsi ? ALL_BY_OCCURRED_AT_INDEX : undefined,
        KeyConditionExpression: conditions.join(' AND '),
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        Limit: limit,
        ScanIndexForward: false,
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    const items = (result.Items ?? []) as ItemRecord[];
    const nextCursor = result.LastEvaluatedKey ? encodeCursor(result.LastEvaluatedKey) : null;

    return {
      items: items.map((item) => this.mapper.toEntity(item)),
      nextCursor,
    };
  }

  public async findById(
    eventId: string,
    occurredAt: number,
    serviceId: string
  ): Promise<ErrorEvent | null> {
    return this.entityStore.get({ serviceId, occurredAt, eventId });
  }
}
