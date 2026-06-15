/**
 * DynamoDBDocumentClient を DynamoTableStore インターフェースに適合させるアダプター
 *
 * 本番用途。テスト時は InMemoryStoreAdapter を使う。
 */

import {
  ScanCommand,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { DynamoDBItem } from '@nagiyu/aws';
import type { DynamoTableStore, ScanPage, QueryPage } from './store-adapter.js';

/**
 * DynamoDB DocumentClient をラップするストアアダプター
 */
export class DynamoDocumentClientStoreAdapter implements DynamoTableStore {
  private readonly client: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(client: DynamoDBDocumentClient, tableName: string) {
    this.client = client;
    this.tableName = tableName;
  }

  public async scan(options: {
    pkPrefix?: string;
    skPrefix?: string;
    exclusiveStartKey?: string;
  }): Promise<ScanPage> {
    const { pkPrefix, skPrefix, exclusiveStartKey } = options;

    // FilterExpression の構築
    const filterParts: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, unknown> = {};

    if (pkPrefix) {
      filterParts.push('begins_with(#PK, :pkPrefix)');
      expressionAttributeNames['#PK'] = 'PK';
      expressionAttributeValues[':pkPrefix'] = pkPrefix;
    }
    if (skPrefix) {
      filterParts.push('begins_with(#SK, :skPrefix)');
      expressionAttributeNames['#SK'] = 'SK';
      expressionAttributeValues[':skPrefix'] = skPrefix;
    }

    const filterExpression = filterParts.length > 0 ? filterParts.join(' AND ') : undefined;

    const command = new ScanCommand({
      TableName: this.tableName,
      FilterExpression: filterExpression,
      ExpressionAttributeNames:
        Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues:
        Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined,
      ExclusiveStartKey: exclusiveStartKey ? this.decodeKey(exclusiveStartKey) : undefined,
    });

    const result = await this.client.send(command);

    return {
      items: (result.Items ?? []) as DynamoDBItem[],
      lastEvaluatedKey: result.LastEvaluatedKey
        ? this.encodeKey(result.LastEvaluatedKey)
        : undefined,
    };
  }

  public async queryGsi(options: {
    indexName: string;
    pkAttributeName: string;
    pkValue: string;
    skAttributeName: string;
    skFrom: string;
    exclusiveStartKey?: string;
  }): Promise<QueryPage> {
    const { indexName, pkAttributeName, pkValue, skAttributeName, skFrom, exclusiveStartKey } =
      options;

    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: indexName,
      KeyConditionExpression: '#pk = :pkValue AND #sk >= :skFrom',
      ExpressionAttributeNames: {
        '#pk': pkAttributeName,
        '#sk': skAttributeName,
      },
      ExpressionAttributeValues: {
        ':pkValue': pkValue,
        ':skFrom': skFrom,
      },
      ExclusiveStartKey: exclusiveStartKey ? this.decodeKey(exclusiveStartKey) : undefined,
    });

    const result = await this.client.send(command);

    return {
      items: (result.Items ?? []) as DynamoDBItem[],
      lastEvaluatedKey: result.LastEvaluatedKey
        ? this.encodeKey(result.LastEvaluatedKey)
        : undefined,
    };
  }

  public async put(item: DynamoDBItem): Promise<void> {
    const command = new PutCommand({
      TableName: this.tableName,
      Item: item,
    });
    await this.client.send(command);
  }

  public async delete(pk: string, sk: string): Promise<void> {
    const command = new DeleteCommand({
      TableName: this.tableName,
      Key: { PK: pk, SK: sk },
    });
    await this.client.send(command);
  }

  private encodeKey(key: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(key)).toString('base64');
  }

  private decodeKey(encoded: string): Record<string, unknown> {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8')) as Record<string, unknown>;
  }
}
