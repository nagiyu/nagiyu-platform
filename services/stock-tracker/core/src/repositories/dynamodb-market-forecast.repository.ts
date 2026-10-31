/**
 * Stock Tracker Core - DynamoDB MarketForecast Repository
 *
 * DynamoDBを使用したMarketForecastRepositoryの実装
 */
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, queryAllItems, toDatabaseError, type EntityStore } from '@nagiyu/aws';
import type {
  AppendMarketForecastOutcomeResult,
  CreateMarketForecastResult,
  MarketForecastRepository,
} from './market-forecast.repository.interface.js';
import type {
  CreateMarketForecastInput,
  MarketForecastEntity,
  MarketForecastKey,
} from '../entities/market-forecast.entity.js';
import type { Market, MarketOutcome, MarketSample } from '../forecast/index.js';
import {
  MarketForecastMapper,
  MARKET_FORECAST_OUTCOME_ATTRIBUTE,
  buildMarketForecastPk,
  buildMarketForecastSk,
  buildMarketForecastSkUpperBound,
} from '../mappers/market-forecast.mapper.js';

/**
 * DynamoDB MarketForecast Repository
 *
 * 単一アイテムの作成・取得・Outcome 追記は EntityStore に任せ、市場の期間 Query だけを自前で持つ
 */
export class DynamoDBMarketForecastRepository implements MarketForecastRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly mapper = new MarketForecastMapper();
  private readonly entityStore: EntityStore<MarketForecastEntity, MarketForecastKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper);
  }

  /**
   * MarketForecast を新規作成する。既に存在する場合は書き込まず、既存のアイテムを返す
   */
  public async createIfAbsent(
    input: CreateMarketForecastInput
  ): Promise<CreateMarketForecastResult> {
    const { entity, created } = await this.entityStore.createIfAbsent(input);
    return { item: entity, created };
  }

  /**
   * 既存 MarketForecast に採点結果（Outcome）を条件付きで追記する
   * (アイテムが存在し、かつ Outcome が未設定のときだけ書く)
   */
  public async appendOutcome(
    key: MarketForecastKey,
    outcome: MarketOutcome
  ): Promise<AppendMarketForecastOutcomeResult> {
    const { entity, updated } = await this.entityStore.updateIfAttributeAbsent(
      key,
      MARKET_FORECAST_OUTCOME_ATTRIBUTE,
      { outcome: this.mapper.toOutcomeAttribute(outcome) }
    );
    return { item: entity, updated };
  }

  /**
   * Market と Date で単一の MarketForecast を取得
   */
  public async getByMarketAndDate(
    market: Market,
    date: string
  ): Promise<MarketForecastEntity | null> {
    return this.entityStore.get({ market, date });
  }

  /**
   * 市場の MarketForecast を、期間でサンプル列として読み出す（ベーステーブルの PK=MARKETFORECAST#{Market} を Query）
   *
   * MarketForecast は市場につき 1 日 1 件のため、Forecast のような軽量プロジェクションは行わない
   * （読み出し量が Forecast ほど銘柄数に比例して増えないため）。
   */
  public async getSamplesByDateRange(
    market: Market,
    fromDate?: string,
    toDate?: string
  ): Promise<MarketSample[]> {
    try {
      const condition = buildSkCondition(fromDate, toDate);

      const items = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        KeyConditionExpression: condition.expression,
        ExpressionAttributeNames: { '#pk': 'PK', ...condition.names },
        ExpressionAttributeValues: {
          ':pk': buildMarketForecastPk(market),
          ...condition.values,
        },
      });

      return items.map((item) => this.mapper.toSample(item));
    } catch (error) {
      throw toDatabaseError(error);
    }
  }
}

/**
 * ベーステーブル SK（`DATE#{Date}`）の期間条件を組み立てる。
 *
 * DynamoDB は式で使わない ExpressionAttributeNames を拒否するため、範囲条件がないときは
 * `#sk` を名前に含めない。
 */
function buildSkCondition(
  fromDate?: string,
  toDate?: string
): { expression: string; names: Record<string, string>; values: Record<string, unknown> } {
  const skName = { '#sk': 'SK' };
  if (fromDate !== undefined && toDate !== undefined) {
    return {
      expression: '#pk = :pk AND #sk BETWEEN :from AND :to',
      names: skName,
      values: {
        ':from': buildMarketForecastSk(fromDate),
        ':to': buildMarketForecastSkUpperBound(toDate),
      },
    };
  }
  if (fromDate !== undefined) {
    return {
      expression: '#pk = :pk AND #sk >= :from',
      names: skName,
      values: { ':from': buildMarketForecastSk(fromDate) },
    };
  }
  if (toDate !== undefined) {
    return {
      expression: '#pk = :pk AND #sk <= :to',
      names: skName,
      values: { ':to': buildMarketForecastSkUpperBound(toDate) },
    };
  }
  return { expression: '#pk = :pk', names: {}, values: {} };
}
