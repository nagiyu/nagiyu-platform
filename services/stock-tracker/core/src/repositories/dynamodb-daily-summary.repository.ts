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
import { queryAllItems, toDatabaseError, type DynamoDBItem } from '@nagiyu/aws';
import type { DailySummaryRepository } from './daily-summary.repository.interface.js';
import type {
  DailySummaryEntity,
  DailySummaryForecastFields,
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
      throw toDatabaseError(error);
    }
  }

  /**
   * 取引所IDでサマリーを取得（GSI4=ExchangeSummaryIndexを使用）
   *
   * GSI4SK（`DATE#{Date}#{TickerID}`）昇順のQueryで、インタフェース契約のDate昇順・
   * 同日内TickerID昇順を実現する。date省略時は、取引所の全履歴を読むと履歴の増加に
   * 比例して遅くなるため、GSI4SK降順・Limit 1のQueryで最新日だけを先に特定し、
   * その日付で date 指定時と同じ Query を行う。
   */
  public async getByExchange(exchangeId: string, date?: string): Promise<DailySummaryEntity[]> {
    try {
      const targetDate = date ?? (await this.findLatestDate(exchangeId));
      if (targetDate === undefined) {
        return [];
      }

      const items = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        IndexName: 'ExchangeSummaryIndex',
        KeyConditionExpression: '#gsi4pk = :exchangeId AND begins_with(#gsi4sk, :datePrefix)',
        ExpressionAttributeNames: {
          '#gsi4pk': 'GSI4PK',
          '#gsi4sk': 'GSI4SK',
        },
        ExpressionAttributeValues: {
          ':exchangeId': exchangeId,
          ':datePrefix': `DATE#${targetDate}`,
        },
      });

      return items.map((item) => this.mapper.toEntity(item));
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  /**
   * 取引所の最新サマリー日付を取得する（GSI4を降順・1件で引く）
   *
   * @returns 最新日付。サマリーが1件もなければ undefined
   */
  private async findLatestDate(exchangeId: string): Promise<string | undefined> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'ExchangeSummaryIndex',
        KeyConditionExpression: '#gsi4pk = :exchangeId',
        ExpressionAttributeNames: {
          '#gsi4pk': 'GSI4PK',
        },
        ExpressionAttributeValues: {
          ':exchangeId': exchangeId,
        },
        ScanIndexForward: false,
        Limit: 1,
      })
    );

    const latest = result.Items?.[0] as DynamoDBItem | undefined;
    return latest ? this.mapper.toEntity(latest).Date : undefined;
  }

  /**
   * 取引所IDと日付範囲でサマリーを取得（GSI4使用、両端含む）
   *
   * GSI4SK は `DATE#{Date}#{TickerID}` 形式のため、`DATE#{toDate}` の prefix だけでは
   * `toDate` の項目を漏らしてしまう。よって ASCII でほぼ最大の `~`（0x7E）を末尾に付けて
   * `DATE#{toDate}#~` まで含める。
   *
   * 前提（現行のTickerID体系では成立する）: TickerIDに `~`（0x7E）より大きいコードポイントの
   * 文字が含まれると、`DATE#{toDate}#{TickerID}` が `DATE#{toDate}#~` より辞書順で大きくなり、
   * between の上限を超えて `toDate` 分のその項目が漏れる。現行のTickerID体系
   * （`NSDQ:AAPL` 形式、ASCII印字可能文字の範囲）ではこれは起こらない。
   */
  public async getByExchangeAndDateRange(
    exchangeId: string,
    fromDate: string,
    toDate: string
  ): Promise<DailySummaryEntity[]> {
    try {
      const items = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        IndexName: 'ExchangeSummaryIndex',
        KeyConditionExpression: '#gsi4pk = :exchangeId AND #gsi4sk BETWEEN :from AND :to',
        ExpressionAttributeNames: {
          '#gsi4pk': 'GSI4PK',
          '#gsi4sk': 'GSI4SK',
        },
        ExpressionAttributeValues: {
          ':exchangeId': exchangeId,
          ':from': `DATE#${fromDate}`,
          ':to': `DATE#${toDate}#~`,
        },
      });

      return items.map((item) => this.mapper.toEntity(item));
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  /**
   * 取引所IDと日付範囲で、確度算出に使う属性だけを ProjectionExpression で絞って取得する
   * （GSI4使用、両端含む。範囲の扱いは `getByExchangeAndDateRange` と同じ）。
   */
  public async getForecastFieldsByExchangeAndDateRange(
    exchangeId: string,
    fromDate: string,
    toDate: string
  ): Promise<DailySummaryForecastFields[]> {
    try {
      const items = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        IndexName: 'ExchangeSummaryIndex',
        KeyConditionExpression: '#gsi4pk = :exchangeId AND #gsi4sk BETWEEN :from AND :to',
        ProjectionExpression:
          '#tickerId, #exchangeId, #date, #open, #high, #low, #close, #volume, ' +
          '#patternResults, #buyPatternCount, #sellPatternCount, #createdAt',
        ExpressionAttributeNames: {
          '#gsi4pk': 'GSI4PK',
          '#gsi4sk': 'GSI4SK',
          '#tickerId': 'TickerID',
          '#exchangeId': 'ExchangeID',
          '#date': 'Date',
          '#open': 'Open',
          '#high': 'High',
          '#low': 'Low',
          '#close': 'Close',
          '#volume': 'Volume',
          '#patternResults': 'PatternResults',
          '#buyPatternCount': 'BuyPatternCount',
          '#sellPatternCount': 'SellPatternCount',
          '#createdAt': 'CreatedAt',
        },
        ExpressionAttributeValues: {
          ':exchangeId': exchangeId,
          ':from': `DATE#${fromDate}`,
          ':to': `DATE#${toDate}#~`,
        },
      });

      return items.map((item) => this.mapper.toForecastFields(item));
    } catch (error) {
      throw toDatabaseError(error);
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
      throw toDatabaseError(error);
    }
  }
}
