/**
 * Stock Tracker Core - DynamoDB MarketForecast Repository
 *
 * DynamoDBを使用したMarketForecastRepositoryの実装
 */
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError, EntityNotFoundError, type DynamoDBItem } from '@nagiyu/aws';
import { toErrorMessage } from '@nagiyu/common';
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
import { MarketForecastMapper } from '../mappers/market-forecast.mapper.js';

/**
 * DynamoDB MarketForecast Repository
 *
 * DynamoDBを使用した確度（市場×日）リポジトリの実装
 */
export class DynamoDBMarketForecastRepository implements MarketForecastRepository {
  private readonly mapper: MarketForecastMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.mapper = new MarketForecastMapper();
  }

  /**
   * MarketForecast を条件付きで新規作成する（`attribute_not_exists(PK)`）
   */
  public async createIfAbsent(
    input: CreateMarketForecastInput
  ): Promise<CreateMarketForecastResult> {
    try {
      const now = Date.now();
      const item = this.mapper.toCreateItem(input, now);

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      return { item: this.mapper.toEntity(item), created: true };
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        const existing = await this.getByMarketAndDate(input.Market, input.Date);
        if (!existing) {
          throw new DatabaseError(
            'MarketForecast の作成に失敗しましたが、既存アイテムが見つかりません'
          );
        }
        return { item: existing, created: false };
      }
      const message = toErrorMessage(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 既存 MarketForecast に採点結果（Outcome）を条件付きで追記する
   */
  public async appendOutcome(
    key: MarketForecastKey,
    outcome: MarketOutcome
  ): Promise<AppendMarketForecastOutcomeResult> {
    try {
      const { pk, sk } = this.mapper.buildKeys(key);
      const now = Date.now();
      const outcomeAttr = this.mapper.toOutcomeAttribute(outcome);

      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: 'SET #outcome = :outcome, #updatedAt = :updatedAt',
          ExpressionAttributeNames: { '#outcome': 'Outcome', '#updatedAt': 'UpdatedAt' },
          ExpressionAttributeValues: { ':outcome': outcomeAttr, ':updatedAt': now },
          ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(Outcome)',
          ReturnValues: 'ALL_NEW',
        })
      );

      return {
        item: this.mapper.toEntity(result.Attributes as unknown as DynamoDBItem),
        updated: true,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        const existing = await this.getByMarketAndDate(key.market, key.date);
        if (!existing) {
          throw new EntityNotFoundError('MarketForecast', `${key.market}#${key.date}`);
        }
        return { item: existing, updated: false };
      }
      const message = toErrorMessage(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Market と Date で単一の MarketForecast を取得
   */
  public async getByMarketAndDate(
    market: Market,
    date: string
  ): Promise<MarketForecastEntity | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ market, date });

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
      const items: DynamoDBItem[] = [];
      let lastEvaluatedKey: Record<string, unknown> | undefined;
      const condition = buildSkCondition(fromDate, toDate);

      do {
        const result = await this.docClient.send(
          new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: condition.expression,
            ExpressionAttributeNames: { '#pk': 'PK', ...condition.names },
            ExpressionAttributeValues: {
              ':pk': this.mapper.buildPk(market),
              ...condition.values,
            },
            ExclusiveStartKey: lastEvaluatedKey,
          })
        );

        items.push(...((result.Items as DynamoDBItem[] | undefined) ?? []));
        lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (lastEvaluatedKey);

      return items.map((item) => this.mapper.toSample(item));
    } catch (error) {
      const message = toErrorMessage(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
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
      values: { ':from': `DATE#${fromDate}`, ':to': `DATE#${toDate}#~` },
    };
  }
  if (fromDate !== undefined) {
    return {
      expression: '#pk = :pk AND #sk >= :from',
      names: skName,
      values: { ':from': `DATE#${fromDate}` },
    };
  }
  if (toDate !== undefined) {
    return {
      expression: '#pk = :pk AND #sk <= :to',
      names: skName,
      values: { ':to': `DATE#${toDate}#~` },
    };
  }
  return { expression: '#pk = :pk', names: {}, values: {} };
}
