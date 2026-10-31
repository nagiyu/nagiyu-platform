/**
 * Stock Tracker Core - DynamoDB Forecast Repository
 *
 * DynamoDBを使用したForecastRepositoryの実装
 */
import { UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DatabaseError,
  DynamoDBEntityStore,
  EntityAlreadyExistsError,
  EntityNotFoundError,
  buildUpdateExpression,
  isConditionalCheckFailed,
  queryAllItems,
  toDatabaseError,
  type EntityStore,
} from '@nagiyu/aws';
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
import {
  ForecastMapper,
  FORECAST_OUTCOME_ATTRIBUTE,
  FORECAST_SAMPLE_ATTRIBUTE_PATHS,
  buildForecastGsi4Pk,
} from '../mappers/forecast.mapper.js';
import {
  buildExchangeSummaryGsi4DatePrefix,
  buildExchangeSummaryGsi4DateUpperBound,
} from '../mappers/exchange-summary-index.js';
import { buildProjection } from './projection.js';

/** GSI4SK の期間条件（`buildSampleKeyCondition` の戻り値） */
interface KeyConditionParts {
  expression: string;
  names: Record<string, string>;
  values: Record<string, unknown>;
}

/**
 * DynamoDB Forecast Repository
 *
 * 単一アイテムの作成・取得は EntityStore に任せ、条件付きの Outcome 追記と
 * GSI4 の Query だけを自前で持つ
 */
export class DynamoDBForecastRepository implements ForecastRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly mapper = new ForecastMapper();
  private readonly entityStore: EntityStore<ForecastEntity, ForecastKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper);
  }

  /**
   * Forecast を新規作成する。既に存在する場合は書き込まず、既存のアイテムを返す
   */
  public async createIfAbsent(input: CreateForecastInput): Promise<CreateForecastResult> {
    try {
      const item = await this.entityStore.create(input);
      return { item, created: true };
    } catch (error) {
      if (error instanceof EntityAlreadyExistsError) {
        const existing = await this.entityStore.get({
          tickerId: input.tickerId,
          date: input.date,
        });
        if (!existing) {
          throw new DatabaseError(
            'Forecast の作成に失敗しましたが、既存アイテムが見つかりません',
            error
          );
        }
        return { item: existing, created: false };
      }
      throw error;
    }
  }

  /**
   * 既存 Forecast に採点結果（Outcome）を条件付きで追記する
   * (アイテムが存在し、かつ Outcome が未設定のときだけ書く)
   *
   * 「Outcome が未設定」の条件は EntityStore の update では表せないため自前で書く。
   * 属性の変換は Mapper の `toUpdateAttributes` に任せ、updatedAt は他の書き込みと同じく現在時刻で書く。
   */
  public async appendOutcome(
    key: ForecastKey,
    outcome: TickerOutcome
  ): Promise<AppendForecastOutcomeResult> {
    try {
      const keys = this.mapper.buildKeys(key);
      const attributes = this.mapper.toUpdateAttributes(
        { outcome: this.mapper.toOutcomeAttribute(outcome) },
        key
      );
      const parts = buildUpdateExpression(attributes, {
        timestamp: { attributeName: 'UpdatedAt', value: Date.now() },
      });
      if (!parts) {
        // timestamp を渡しているため到達しない。型の絞り込みのために明示する
        throw new DatabaseError('Outcome の更新式を組み立てられませんでした');
      }

      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: keys,
          UpdateExpression: parts.UpdateExpression,
          ConditionExpression: 'attribute_exists(#pk) AND attribute_not_exists(#outcome)',
          ExpressionAttributeNames: {
            ...parts.ExpressionAttributeNames,
            '#pk': Object.keys(keys)[0],
            '#outcome': FORECAST_OUTCOME_ATTRIBUTE,
          },
          ExpressionAttributeValues: parts.ExpressionAttributeValues,
          ReturnValues: 'ALL_NEW',
        })
      );

      if (!result.Attributes) {
        throw new DatabaseError('Outcome の追記後のデータを取得できませんでした');
      }
      return { item: this.mapper.toEntity(result.Attributes), updated: true };
    } catch (error) {
      if (isConditionalCheckFailed(error)) {
        const existing = await this.entityStore.get(key);
        if (!existing) {
          throw new EntityNotFoundError(this.mapper.entityType, `${key.tickerId}#${key.date}`);
        }
        // 既存アイテムはあるが条件不成立 → 既に Outcome がある（冪等な再実行）
        return { item: existing, updated: false };
      }
      throw toDatabaseError(error);
    }
  }

  /**
   * TickerID と Date で単一の Forecast を取得
   */
  public async getByTickerAndDate(tickerId: string, date: string): Promise<ForecastEntity | null> {
    return this.entityStore.get({ tickerId, date });
  }

  /**
   * 取引所IDと Date で同一取引所・同一日の Forecast 一覧を取得（GSI4=ExchangeSummaryIndexを使用）
   *
   * GSI4SK（`DATE#{Date}#{TickerID}`）昇順のQueryで、インタフェース契約のTickerID昇順を実現する。
   */
  public async getByExchangeAndDate(exchangeId: string, date: string): Promise<ForecastEntity[]> {
    try {
      const items = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        IndexName: 'ExchangeSummaryIndex',
        KeyConditionExpression: '#gsi4pk = :exchangeId AND begins_with(#gsi4sk, :datePrefix)',
        ExpressionAttributeNames: { '#gsi4pk': 'GSI4PK', '#gsi4sk': 'GSI4SK' },
        ExpressionAttributeValues: {
          ':exchangeId': buildForecastGsi4Pk(exchangeId),
          ':datePrefix': buildExchangeSummaryGsi4DatePrefix(date),
        },
      });

      return items.map((item) => this.mapper.toEntity(item));
    } catch (error) {
      throw toDatabaseError(error);
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
      const condition = buildSampleKeyCondition(fromDate, toDate);
      const projection = buildProjection(FORECAST_SAMPLE_ATTRIBUTE_PATHS);

      const items = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        IndexName: 'ExchangeSummaryIndex',
        KeyConditionExpression: condition.expression,
        ProjectionExpression: projection.ProjectionExpression,
        ExpressionAttributeNames: {
          '#gsi4pk': 'GSI4PK',
          ...projection.ExpressionAttributeNames,
          ...condition.names,
        },
        ExpressionAttributeValues: {
          ':exchangeId': buildForecastGsi4Pk(exchangeId),
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
 * GSI4SK の期間条件を組み立てる。
 *
 * DynamoDB は式で使わない ExpressionAttributeNames を拒否するため、範囲条件がないときは
 * `#gsi4sk` を名前に含めない。
 */
function buildSampleKeyCondition(fromDate?: string, toDate?: string): KeyConditionParts {
  const skName = { '#gsi4sk': 'GSI4SK' };
  if (fromDate !== undefined && toDate !== undefined) {
    return {
      expression: '#gsi4pk = :exchangeId AND #gsi4sk BETWEEN :from AND :to',
      names: skName,
      values: {
        ':from': buildExchangeSummaryGsi4DatePrefix(fromDate),
        ':to': buildExchangeSummaryGsi4DateUpperBound(toDate),
      },
    };
  }
  if (fromDate !== undefined) {
    return {
      expression: '#gsi4pk = :exchangeId AND #gsi4sk >= :from',
      names: skName,
      values: { ':from': buildExchangeSummaryGsi4DatePrefix(fromDate) },
    };
  }
  if (toDate !== undefined) {
    return {
      expression: '#gsi4pk = :exchangeId AND #gsi4sk <= :to',
      names: skName,
      values: { ':to': buildExchangeSummaryGsi4DateUpperBound(toDate) },
    };
  }
  return { expression: '#gsi4pk = :exchangeId', names: {}, values: {} };
}
