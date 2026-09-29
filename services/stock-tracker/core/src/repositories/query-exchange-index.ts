/**
 * Stock Tracker Core - 取引所インデックス Query
 *
 * 取引所リポジトリと銘柄リポジトリが、リポジトリ間の依存を作らずに
 * 同じ取り方(ExchangeTickerIndex を GSI3PK 固定値で Query)を共有するためのヘルパー
 */

import {
  QueryCommand,
  type DynamoDBDocumentClient,
  type QueryCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import type { DynamoDBItem } from '@nagiyu/aws';
import { EXCHANGE_GSI3_PK } from '../mappers/exchange.mapper.js';

/**
 * ExchangeTickerIndex から取引所アイテムを全件取得する
 *
 * LastEvaluatedKey がなくなるまで Query を繰り返す。GSI3SK 昇順(ExchangeID 昇順)で返る。
 * GSI キーを持たない取引所アイテムは含まれないため、0 件のときの扱いは呼び出し側で決める。
 *
 * @param docClient - DynamoDB Document Client
 * @param tableName - テーブル名
 * @returns 取引所アイテム
 */
export async function queryExchangeItems(
  docClient: DynamoDBDocumentClient,
  tableName: string
): Promise<DynamoDBItem[]> {
  const items: DynamoDBItem[] = [];
  let exclusiveStartKey: QueryCommandOutput['LastEvaluatedKey'];

  do {
    const result: QueryCommandOutput = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'ExchangeTickerIndex',
        KeyConditionExpression: '#gsi3pk = :exchanges',
        ExpressionAttributeNames: {
          '#gsi3pk': 'GSI3PK',
        },
        ExpressionAttributeValues: {
          ':exchanges': EXCHANGE_GSI3_PK,
        },
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    items.push(...((result.Items as unknown as DynamoDBItem[] | undefined) ?? []));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
}
