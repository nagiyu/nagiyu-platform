/**
 * Stock Tracker Core - DynamoDB Daily Summary Repository
 *
 * DynamoDBを使用したDailySummaryRepositoryの実装
 */

import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, queryAllItems, toDatabaseError, type EntityStore } from '@nagiyu/aws';
import type { DailySummaryRepository } from './daily-summary.repository.interface.js';
import type {
  DailySummaryEntity,
  DailySummaryForecastFields,
  DailySummaryKey,
  CreateDailySummaryInput,
} from '../entities/daily-summary.entity.js';
import {
  DailySummaryMapper,
  DAILY_SUMMARY_FORECAST_FIELD_ATTRIBUTES,
  buildDailySummaryGsi4Pk,
} from '../mappers/daily-summary.mapper.js';
import {
  buildExchangeSummaryGsi4DatePrefix,
  buildExchangeSummaryGsi4DateUpperBound,
} from '../mappers/exchange-summary-index.js';
import { buildProjection } from './projection.js';

/**
 * DynamoDB Daily Summary Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、GSI4 の Query だけを自前で持つ
 */
export class DynamoDBDailySummaryRepository implements DailySummaryRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly mapper = new DailySummaryMapper();
  private readonly entityStore: EntityStore<DailySummaryEntity, DailySummaryKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper);
  }

  /**
   * TickerID と Date でサマリーを取得
   */
  public async getByTickerAndDate(
    tickerId: string,
    date: string
  ): Promise<DailySummaryEntity | null> {
    return this.entityStore.get({ tickerId, date });
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
          ':exchangeId': buildDailySummaryGsi4Pk(exchangeId),
          ':datePrefix': buildExchangeSummaryGsi4DatePrefix(targetDate),
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
          ':exchangeId': buildDailySummaryGsi4Pk(exchangeId),
        },
        ScanIndexForward: false,
        Limit: 1,
      })
    );

    const latest = result.Items?.[0];
    return latest ? this.mapper.toEntity(latest).date : undefined;
  }

  /**
   * 取引所IDと日付範囲でサマリーを取得（GSI4使用、両端含む）
   *
   * GSI4SK は `DATE#{Date}#{TickerID}` 形式のため、`DATE#{toDate}` を上限にすると
   * `toDate` の項目が漏れる。ASCII でほぼ最大の `~` (0x7E) を末尾に付けた値を上限にする。
   * TickerID に `~` より大きいコードポイントの文字が含まれると `toDate` 分のその項目が漏れるが、
   * 現行の TickerID 体系 (`NSDQ:AAPL` 形式、ASCII 印字可能文字) では起こらない。
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
          ':exchangeId': buildDailySummaryGsi4Pk(exchangeId),
          ':from': buildExchangeSummaryGsi4DatePrefix(fromDate),
          ':to': buildExchangeSummaryGsi4DateUpperBound(toDate),
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
      const projection = buildProjection(
        DAILY_SUMMARY_FORECAST_FIELD_ATTRIBUTES.map((attribute) => [attribute])
      );
      const items = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        IndexName: 'ExchangeSummaryIndex',
        KeyConditionExpression: '#gsi4pk = :exchangeId AND #gsi4sk BETWEEN :from AND :to',
        ProjectionExpression: projection.ProjectionExpression,
        ExpressionAttributeNames: {
          '#gsi4pk': 'GSI4PK',
          '#gsi4sk': 'GSI4SK',
          ...projection.ExpressionAttributeNames,
        },
        ExpressionAttributeValues: {
          ':exchangeId': buildDailySummaryGsi4Pk(exchangeId),
          ':from': buildExchangeSummaryGsi4DatePrefix(fromDate),
          ':to': buildExchangeSummaryGsi4DateUpperBound(toDate),
        },
      });

      return items.map((item) => this.mapper.toForecastFields(item));
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  /**
   * サマリーを保存（既存の場合は上書き）
   *
   * 上書きしても作成日時は最初の値を保つため、先に既存を読んで引き継ぐ。
   */
  public async upsert(input: CreateDailySummaryInput): Promise<DailySummaryEntity> {
    const existing = await this.entityStore.get({ tickerId: input.tickerId, date: input.date });
    return this.entityStore.put({ ...input, createdAt: existing?.createdAt });
  }
}
