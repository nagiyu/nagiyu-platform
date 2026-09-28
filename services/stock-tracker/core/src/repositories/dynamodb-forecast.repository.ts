/**
 * Stock Tracker Core - DynamoDB Forecast Repository
 *
 * DynamoDBを使用したForecastRepositoryの実装
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
  AppendForecastOutcomeResult,
  CreateForecastResult,
  ForecastRepository,
} from './forecast.repository.interface.js';
import type {
  CreateForecastInput,
  ForecastEntity,
  ForecastKey,
} from '../entities/forecast.entity.js';
import type { TickerOutcome, TickerSample } from '../forecast/index.js';
import { ForecastMapper } from '../mappers/forecast.mapper.js';

/**
 * サンプル読み出し（{@link TickerSample}）用の軽量 ProjectionExpression。
 *
 * 寄与（contributions）・確率帯実績（bandHistory）・中立帯（neutralBand）等、学習・基準値・
 * 中立帯の算出に使わない属性を落とし、全期間読み出し時の転送量を抑える（design.md §3.1）。
 */
const SAMPLE_PROJECTION_NAMES: Record<string, string> = {
  '#gsi4pk': 'GSI4PK',
  '#gsi4sk': 'GSI4SK',
  '#tickerId': 'TickerID',
  '#exchangeId': 'ExchangeID',
  '#market': 'Market',
  '#date': 'Date',
  '#axisValues': 'AxisValues',
  '#normal': 'Normal',
  '#outcome': 'Outcome',
  '#probabilities': 'Probabilities',
  '#dir': 'DIR',
  '#vol': 'VOL',
  '#probability': 'probability',
  '#baseline': 'baseline',
};

const SAMPLE_PROJECTION_EXPRESSION = [
  '#tickerId',
  '#exchangeId',
  '#market',
  '#date',
  '#axisValues',
  '#normal',
  '#outcome',
  '#probabilities.#dir.#probability',
  '#probabilities.#dir.#baseline',
  '#probabilities.#vol.#probability',
  '#probabilities.#vol.#baseline',
].join(', ');

/** GSI4SK の期間条件（`buildSampleKeyCondition` の戻り値） */
interface KeyConditionParts {
  expression: string;
  values: Record<string, unknown>;
}

/**
 * DynamoDB Forecast Repository
 *
 * DynamoDBを使用した確度（銘柄×日）リポジトリの実装
 */
export class DynamoDBForecastRepository implements ForecastRepository {
  private readonly mapper: ForecastMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.mapper = new ForecastMapper();
  }

  /**
   * Forecast を条件付きで新規作成する（`attribute_not_exists(PK)`）
   */
  public async createIfAbsent(input: CreateForecastInput): Promise<CreateForecastResult> {
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
        const existing = await this.getByTickerAndDate(input.TickerID, input.Date);
        if (!existing) {
          throw new DatabaseError('Forecast の作成に失敗しましたが、既存アイテムが見つかりません');
        }
        return { item: existing, created: false };
      }
      const message = toErrorMessage(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 既存 Forecast に採点結果（Outcome）を条件付きで追記する
   * （`attribute_exists(PK) AND attribute_not_exists(Outcome)`）
   */
  public async appendOutcome(
    key: ForecastKey,
    outcome: TickerOutcome
  ): Promise<AppendForecastOutcomeResult> {
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
        const existing = await this.getByTickerAndDate(key.tickerId, key.date);
        if (!existing) {
          throw new EntityNotFoundError('Forecast', `${key.tickerId}#${key.date}`);
        }
        // 既存アイテムはあるが条件不成立 → 既に Outcome がある（冪等な再実行）
        return { item: existing, updated: false };
      }
      const message = toErrorMessage(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * TickerID と Date で単一の Forecast を取得
   */
  public async getByTickerAndDate(tickerId: string, date: string): Promise<ForecastEntity | null> {
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
      const message = toErrorMessage(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 取引所IDと Date で同一取引所・同一日の Forecast 一覧を取得（GSI4=ExchangeSummaryIndexを使用）
   *
   * GSI4SK（`DATE#{Date}#{TickerID}`）昇順のQueryで、インタフェース契約のTickerID昇順を実現する。
   */
  public async getByExchangeAndDate(exchangeId: string, date: string): Promise<ForecastEntity[]> {
    try {
      const items: DynamoDBItem[] = [];
      let lastEvaluatedKey: Record<string, unknown> | undefined;

      do {
        const result = await this.docClient.send(
          new QueryCommand({
            TableName: this.tableName,
            IndexName: 'ExchangeSummaryIndex',
            KeyConditionExpression: '#gsi4pk = :exchangeId AND begins_with(#gsi4sk, :datePrefix)',
            ExpressionAttributeNames: { '#gsi4pk': 'GSI4PK', '#gsi4sk': 'GSI4SK' },
            ExpressionAttributeValues: {
              ':exchangeId': this.mapper.buildGsi4Pk(exchangeId),
              ':datePrefix': `DATE#${date}`,
            },
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

  /**
   * 複数の取引所の Forecast を、期間でサンプル列として読み出す（取引所ごとに GSI4 を Query）
   */
  public async getSamplesByExchangesAndDateRange(
    exchangeIds: readonly string[],
    fromDate?: string,
    toDate?: string
  ): Promise<TickerSample[]> {
    const samples: TickerSample[] = [];
    for (const exchangeId of exchangeIds) {
      samples.push(...(await this.querySamplesForExchange(exchangeId, fromDate, toDate)));
    }
    return samples;
  }

  /** 1 取引所ぶんのサンプルを、軽量プロジェクションで全ページ読み出す */
  private async querySamplesForExchange(
    exchangeId: string,
    fromDate?: string,
    toDate?: string
  ): Promise<TickerSample[]> {
    try {
      const items: Record<string, unknown>[] = [];
      let lastEvaluatedKey: Record<string, unknown> | undefined;
      const condition = buildSampleKeyCondition(fromDate, toDate);

      do {
        const result = await this.docClient.send(
          new QueryCommand({
            TableName: this.tableName,
            IndexName: 'ExchangeSummaryIndex',
            KeyConditionExpression: condition.expression,
            ProjectionExpression: SAMPLE_PROJECTION_EXPRESSION,
            ExpressionAttributeNames: SAMPLE_PROJECTION_NAMES,
            ExpressionAttributeValues: {
              ':exchangeId': this.mapper.buildGsi4Pk(exchangeId),
              ...condition.values,
            },
            ExclusiveStartKey: lastEvaluatedKey,
          })
        );

        items.push(...((result.Items as Record<string, unknown>[] | undefined) ?? []));
        lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (lastEvaluatedKey);

      return items.map((item) => this.mapper.toSample(item));
    } catch (error) {
      const message = toErrorMessage(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}

/** GSI4SK の期間条件を組み立てる（fromDate・toDate の有無で 3 通り） */
function buildSampleKeyCondition(fromDate?: string, toDate?: string): KeyConditionParts {
  if (fromDate !== undefined && toDate !== undefined) {
    return {
      expression: '#gsi4pk = :exchangeId AND #gsi4sk BETWEEN :from AND :to',
      values: { ':from': `DATE#${fromDate}`, ':to': `DATE#${toDate}#~` },
    };
  }
  if (fromDate !== undefined) {
    return {
      expression: '#gsi4pk = :exchangeId AND #gsi4sk >= :from',
      values: { ':from': `DATE#${fromDate}` },
    };
  }
  return { expression: '#gsi4pk = :exchangeId', values: {} };
}
