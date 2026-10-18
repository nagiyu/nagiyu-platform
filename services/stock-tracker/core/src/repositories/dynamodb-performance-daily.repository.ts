/**
 * Stock Tracker Core - DynamoDB PerformanceDaily Repository
 *
 * DynamoDBを使用したPerformanceDailyRepositoryの実装
 */
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, queryAllItems, toDatabaseError, type EntityStore } from '@nagiyu/aws';
import type { PerformanceDailyRepository } from './performance-daily.repository.interface.js';
import type { PerformanceDailyKey } from '../entities/performance-daily.entity.js';
import type { Market, PerformanceDailyItem, Question } from '../forecast/index.js';
import {
  PerformanceDailyMapper,
  buildPerformanceDailyPk,
  buildPerformanceDailySk,
  buildPerformanceDailySkUpperBound,
} from '../mappers/performance-daily.mapper.js';

/**
 * DynamoDB PerformanceDaily Repository
 *
 * 単一アイテムの保存・取得は EntityStore に任せ、期間の Query だけを自前で持つ
 */
export class DynamoDBPerformanceDailyRepository implements PerformanceDailyRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly mapper = new PerformanceDailyMapper();
  private readonly entityStore: EntityStore<PerformanceDailyItem, PerformanceDailyKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper);
  }

  /**
   * PerformanceDaily を保存する（既存の場合は無条件で置き換える。冪等な再計算）
   */
  public async save(item: PerformanceDailyItem): Promise<PerformanceDailyItem> {
    return this.entityStore.put(item);
  }

  /**
   * 問い・市場・日付で単一の PerformanceDaily を取得
   */
  public async getByDate(
    question: Question,
    market: Market,
    date: string
  ): Promise<PerformanceDailyItem | null> {
    return this.entityStore.get({ question, market, date });
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
      const keyConditionExpression =
        toDate !== undefined
          ? '#pk = :pk AND #sk BETWEEN :from AND :to'
          : '#pk = :pk AND #sk >= :from';
      const expressionAttributeValues: Record<string, unknown> = {
        ':pk': buildPerformanceDailyPk(question, market),
        ':from': buildPerformanceDailySk(fromDate),
        ...(toDate !== undefined ? { ':to': buildPerformanceDailySkUpperBound(toDate) } : {}),
      };

      const items = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: expressionAttributeValues,
      });

      return items.map((item) => this.mapper.toEntity(item));
    } catch (error) {
      throw toDatabaseError(error);
    }
  }
}
