/**
 * Stock Tracker Core - DynamoDB Daily Summary Repository
 *
 * DynamoDBを使用したDailySummaryRepositoryの実装
 */

import {
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError, type DynamoDBItem } from '@nagiyu/aws';
import type { DailySummaryRepository } from './daily-summary.repository.interface.js';
import type {
  DailySummaryEntity,
  CreateDailySummaryInput,
} from '../entities/daily-summary.entity.js';
import { DailySummaryMapper } from '../mappers/daily-summary.mapper.js';

/**
 * DynamoDB Daily Summary Repository
 *
 * DynamoDBを使用した日次サマリーリポジトリの実装
 */
export class DynamoDBDailySummaryRepository implements DailySummaryRepository {
  private readonly mapper: DailySummaryMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.mapper = new DailySummaryMapper();
  }

  /**
   * TickerID と Date でサマリーを取得
   */
  public async getByTickerAndDate(
    tickerId: string,
    date: string
  ): Promise<DailySummaryEntity | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ tickerId, date });

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
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 取引所IDでサマリーを取得（GSI4使用）
   */
  public async getByExchange(exchangeId: string, date?: string): Promise<DailySummaryEntity[]> {
    try {
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'ExchangeSummaryIndex',
          KeyConditionExpression: date
            ? '#gsi4pk = :exchangeId AND begins_with(#gsi4sk, :datePrefix)'
            : '#gsi4pk = :exchangeId',
          ExpressionAttributeNames: date
            ? {
                '#gsi4pk': 'GSI4PK',
                '#gsi4sk': 'GSI4SK',
              }
            : {
                '#gsi4pk': 'GSI4PK',
              },
          ExpressionAttributeValues: date
            ? {
                ':exchangeId': exchangeId,
                ':datePrefix': `DATE#${date}`,
              }
            : {
                ':exchangeId': exchangeId,
              },
        })
      );

      const summaries = (result.Items || []).map((item) =>
        this.mapper.toEntity(item as unknown as DynamoDBItem)
      );

      if (date || summaries.length === 0) {
        return summaries;
      }

      const latestDate = summaries.reduce((latest, summary) => {
        return summary.Date > latest ? summary.Date : latest;
      }, summaries[0].Date);

      return summaries.filter((summary) => summary.Date === latestDate);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * サマリーを保存（既存の場合は上書き）
   */
  public async upsert(input: CreateDailySummaryInput): Promise<DailySummaryEntity> {
    try {
      const existing = await this.getByTickerAndDate(input.TickerID, input.Date);
      const now = Date.now();
      const entity: DailySummaryEntity = {
        ...input,
        CreatedAt: existing?.CreatedAt ?? now,
        UpdatedAt: now,
      };

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: this.mapper.toItem(entity),
        })
      );

      return entity;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
