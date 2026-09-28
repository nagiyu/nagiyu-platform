/**
 * Stock Tracker Core - DynamoDB PerformanceDaily Repository
 *
 * DynamoDBを使用したPerformanceDailyRepositoryの実装
 */
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError, type DynamoDBItem } from '@nagiyu/aws';
import { toErrorMessage } from '@nagiyu/common';
import type { PerformanceDailyRepository } from './performance-daily.repository.interface.js';
import type { Market, PerformanceDailyItem, Question } from '../forecast/index.js';
import { PerformanceDailyMapper } from '../mappers/performance-daily.mapper.js';

/**
 * DynamoDB PerformanceDaily Repository
 *
 * DynamoDBを使用した予測日ごとの採点済み件数の集計リポジトリの実装
 */
export class DynamoDBPerformanceDailyRepository implements PerformanceDailyRepository {
  private readonly mapper: PerformanceDailyMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.mapper = new PerformanceDailyMapper();
  }

  /**
   * PerformanceDaily を保存する（既存の場合は無条件で置き換える。冪等な再計算）
   */
  public async save(item: PerformanceDailyItem): Promise<PerformanceDailyItem> {
    try {
      const dbItem = this.mapper.toItem(item);

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: dbItem,
        })
      );

      return item;
    } catch (error) {
      const message = toErrorMessage(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 問い・市場・日付で単一の PerformanceDaily を取得
   */
  public async getByDate(
    question: Question,
    market: Market,
    date: string
  ): Promise<PerformanceDailyItem | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ question, market, date });

      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
        })
      );

      if (!result.Item) {
        return null;
      }

      return this.mapper.toEntity(result.Item as unknown as DynamoDBItem);
    } catch (error) {
      const message = toErrorMessage(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 問い・市場の PerformanceDaily を、期間（fromDate 以上・toDate 以下）で取得する
   */
  public async getByPeriod(
    question: Question,
    market: Market,
    fromDate: string,
    toDate?: string
  ): Promise<PerformanceDailyItem[]> {
    try {
      const { pk } = this.mapper.buildKeys({ question, market, date: fromDate });
      const items: DynamoDBItem[] = [];
      let lastEvaluatedKey: Record<string, unknown> | undefined;

      const keyConditionExpression =
        toDate !== undefined
          ? '#pk = :pk AND #sk BETWEEN :from AND :to'
          : '#pk = :pk AND #sk >= :from';
      const expressionAttributeValues: Record<string, unknown> = {
        ':pk': pk,
        ':from': `DATE#${fromDate}`,
        ...(toDate !== undefined ? { ':to': `DATE#${toDate}#~` } : {}),
      };

      do {
        const result = await this.docClient.send(
          new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: keyConditionExpression,
            ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
            ExpressionAttributeValues: expressionAttributeValues,
            ExclusiveStartKey: lastEvaluatedKey,
          })
        );

        items.push(...((result.Items as DynamoDBItem[] | undefined) ?? []));
        lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (lastEvaluatedKey);

      return items.map((item) => this.mapper.toEntity(item));
    } catch (error) {
      const message = toErrorMessage(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
