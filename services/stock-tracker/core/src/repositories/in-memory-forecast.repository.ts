/**
 * Stock Tracker Core - InMemory Forecast Repository
 *
 * InMemorySingleTableStoreを使用したForecastRepositoryの実装
 */
import {
  InMemoryEntityStore,
  type DynamoDBAttributes,
  type EntityStore,
  type InMemorySingleTableStore,
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
  buildForecastGsi4Pk,
} from '../mappers/forecast.mapper.js';
import {
  buildExchangeSummaryGsi4DatePrefix,
  buildExchangeSummaryGsi4DateUpperBound,
} from '../mappers/exchange-summary-index.js';

/**
 * InMemory Forecast Repository
 *
 * 単一アイテムの作成・取得・Outcome 追記は EntityStore に任せ、GSI4 の近似クエリだけを自前で持つ。
 * テスト環境で使用
 */
export class InMemoryForecastRepository implements ForecastRepository {
  private readonly store: InMemorySingleTableStore;
  private readonly mapper = new ForecastMapper();
  private readonly entityStore: EntityStore<ForecastEntity, ForecastKey>;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper);
  }

  /**
   * Forecast を新規作成する。既に存在する場合は書き込まず、既存のアイテムを返す
   */
  public async createIfAbsent(input: CreateForecastInput): Promise<CreateForecastResult> {
    const { entity, created } = await this.entityStore.createIfAbsent(input);
    return { item: entity, created };
  }

  /**
   * 既存 Forecast に採点結果（Outcome）を条件付きで追記する
   * (アイテムが存在し、かつ Outcome が未設定のときだけ書く)
   */
  public async appendOutcome(
    key: ForecastKey,
    outcome: TickerOutcome
  ): Promise<AppendForecastOutcomeResult> {
    const { entity, updated } = await this.entityStore.updateIfAttributeAbsent(
      key,
      FORECAST_OUTCOME_ATTRIBUTE,
      { outcome: this.mapper.toOutcomeAttribute(outcome) }
    );
    return { item: entity, updated };
  }

  /**
   * TickerID と Date で単一の Forecast を取得
   */
  public async getByTickerAndDate(tickerId: string, date: string): Promise<ForecastEntity | null> {
    return this.entityStore.get({ tickerId, date });
  }

  /**
   * 取引所IDと Date で同一取引所・同一日の Forecast 一覧を取得（GSI4 をシミュレート）
   */
  public async getByExchangeAndDate(exchangeId: string, date: string): Promise<ForecastEntity[]> {
    const items = this.queryAllByGsi4(exchangeId, buildExchangeSummaryGsi4DatePrefix(date));
    return items.map((item) => this.mapper.toEntity(item));
  }

  /**
   * 複数の取引所の Forecast を、期間でサンプル列として読み出す
   */
  public async getSamplesByExchangesAndDateRange(
    exchangeIds: readonly string[],
    fromDate?: string,
    toDate?: string
  ): Promise<TickerSample[]> {
    const samples: TickerSample[] = [];
    for (const exchangeId of exchangeIds) {
      const items = this.queryAllByGsi4(exchangeId, undefined, fromDate, toDate);
      samples.push(...items.map((item) => this.mapper.toSample(item)));
    }
    return samples;
  }

  /**
   * GSI4（`FORECAST#{ExchangeID}` パーティション）の全件を取得する。
   * `datePrefix` を渡すと begins_with、`fromDate`/`toDate` を渡すと between/以上 で絞り込む
   * （いずれも省略時はパーティション全件）。
   */
  private queryAllByGsi4(
    exchangeId: string,
    datePrefix?: string,
    fromDate?: string,
    toDate?: string
  ): DynamoDBAttributes[] {
    const sk = buildSkCondition(datePrefix, fromDate, toDate);

    return this.store.queryAllByAttribute({
      attributeName: 'GSI4PK',
      attributeValue: buildForecastGsi4Pk(exchangeId),
      gsiSortKeyAttributeName: 'GSI4SK',
      ...(sk ? { sk } : {}),
    });
  }
}

/** GSI4SK の条件（begins_with / between / 以上 / 以下）を組み立てる。全条件省略時は undefined（全件） */
function buildSkCondition(
  datePrefix?: string,
  fromDate?: string,
  toDate?: string
):
  | {
      attributeName: string;
      operator: 'begins_with' | 'between' | 'gte' | 'lte';
      value: string | [string, string];
    }
  | undefined {
  if (datePrefix !== undefined) {
    return { attributeName: 'GSI4SK', operator: 'begins_with', value: datePrefix };
  }
  if (fromDate !== undefined && toDate !== undefined) {
    return {
      attributeName: 'GSI4SK',
      operator: 'between',
      value: [
        buildExchangeSummaryGsi4DatePrefix(fromDate),
        buildExchangeSummaryGsi4DateUpperBound(toDate),
      ],
    };
  }
  if (fromDate !== undefined) {
    return {
      attributeName: 'GSI4SK',
      operator: 'gte',
      value: buildExchangeSummaryGsi4DatePrefix(fromDate),
    };
  }
  if (toDate !== undefined) {
    return {
      attributeName: 'GSI4SK',
      operator: 'lte',
      value: buildExchangeSummaryGsi4DateUpperBound(toDate),
    };
  }
  return undefined;
}
