/**
 * DynamoDB をバックエンドとする ErrorEventReader 実装
 */

import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ErrorEvent, ErrorSeverity, ErrorSource } from '@nagiyu/common';
import {
  buildErrorEventPK,
  buildErrorEventSK,
  ERROR_EVENT_GSI1_PK,
  ERROR_EVENT_SK_PREFIX,
} from '@nagiyu/aws';
import {
  decodeCursor,
  encodeCursor,
  normalizeLimit,
  type ErrorEventReader,
  type ListErrorEventsQuery,
  type ListErrorEventsResult,
} from './reader.js';

const ERROR_MESSAGES = {
  INVALID_RANGE: 'from は to よりも前の時刻である必要があります',
} as const;

const ALL_BY_OCCURRED_AT_INDEX = 'AllByOccurredAt';

type ItemRecord = Record<string, unknown>;

function toErrorEvent(item: ItemRecord): ErrorEvent {
  return {
    eventId: item.eventId as string,
    serviceId: item.serviceId as string,
    source: item.source as ErrorSource,
    severity: item.severity as ErrorSeverity,
    title: item.title as string,
    message: item.message as string,
    context: item.context as string,
    occurredAt: item.occurredAt as string,
  };
}

/**
 * DynamoDB をバックエンドとする ErrorEventReader 実装。
 */
export class DynamoDBErrorEventReader implements ErrorEventReader {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  public async list(query: ListErrorEventsQuery): Promise<ListErrorEventsResult> {
    if (query.from && query.to && Date.parse(query.from) > Date.parse(query.to)) {
      throw new Error(ERROR_MESSAGES.INVALID_RANGE);
    }

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

    if (query.from && query.to) {
      conditions.push('#sk BETWEEN :from AND :to');
      expressionAttributeNames['#sk'] = sortKeyName;
      expressionAttributeValues[':from'] = `${ERROR_EVENT_SK_PREFIX}${query.from}`;
      expressionAttributeValues[':to'] = `${ERROR_EVENT_SK_PREFIX}${query.to}￿`;
    } else if (query.from) {
      conditions.push('#sk >= :from');
      expressionAttributeNames['#sk'] = sortKeyName;
      expressionAttributeValues[':from'] = `${ERROR_EVENT_SK_PREFIX}${query.from}`;
    } else if (query.to) {
      conditions.push('#sk <= :to');
      expressionAttributeNames['#sk'] = sortKeyName;
      expressionAttributeValues[':to'] = `${ERROR_EVENT_SK_PREFIX}${query.to}￿`;
    } else {
      conditions.push('begins_with(#sk, :prefix)');
      expressionAttributeNames['#sk'] = sortKeyName;
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
      items: items.map(toErrorEvent),
      nextCursor,
    };
  }

  public async findById(
    eventId: string,
    occurredAt: string,
    serviceId: string
  ): Promise<ErrorEvent | null> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND #sk = :sk',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK',
        },
        ExpressionAttributeValues: {
          ':pk': buildErrorEventPK(serviceId),
          ':sk': buildErrorEventSK(occurredAt, eventId),
        },
        Limit: 1,
      })
    );

    const item = result.Items?.[0] as ItemRecord | undefined;
    return item ? toErrorEvent(item) : null;
  }
}
